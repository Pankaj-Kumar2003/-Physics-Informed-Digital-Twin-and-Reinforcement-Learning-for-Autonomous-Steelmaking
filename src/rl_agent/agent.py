from __future__ import annotations

import copy
from dataclasses import asdict, dataclass
import random
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import numpy as np
import torch
from torch import nn
from torch.distributions import Categorical

from common.logging import get_logger
from common.types import AlloyAction, ProcessState, RewardBreakdown
from digital_twin.simulator import SteelmakingDigitalTwin

LOGGER = get_logger(__name__)


@dataclass
class RLAgentConfig:
    learning_rate: float = 3e-4
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_epsilon: float = 0.2
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    update_epochs: int = 5
    minibatch_size: int = 256
    rollout_horizon: int = 60
    hidden_sizes: Sequence[int] = (128, 128)
    action_bucket_kg: Tuple[float, float, float] = (5.0, 10.0, 15.0)
    alloy_catalog: Tuple[str, ...] = ("FeSi", "FeMn", "Ni")
    device: str = "auto"
    env_parallelism: int = 1
    seed: int | None = None


@dataclass
class PolicyArtifact:
    path: str
    config: Dict[str, Any]
    actions: List[Tuple[str, float]]
    composition_keys: List[str]
    slag_keys: List[str]


class _MLP(nn.Module):
    def __init__(self, input_dim: int, output_dim: int, hidden_sizes: Sequence[int]) -> None:
        super().__init__()
        layers: List[nn.Module] = []
        prev_dim = input_dim
        for hidden in hidden_sizes:
            layers.append(nn.Linear(prev_dim, hidden))
            layers.append(nn.Tanh())
            prev_dim = hidden
        layers.append(nn.Linear(prev_dim, output_dim))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class AlloyControlAgent:
    """PPO-style actor-critic that learns sequential alloying policies."""

    def __init__(self, twin: SteelmakingDigitalTwin, cfg: RLAgentConfig) -> None:
        self.twin = twin
        self.cfg = cfg
        self._base_seed = cfg.seed if cfg.seed is not None else random.randint(1, 2**31 - 1)
        self.device = self._select_device(cfg.device)

        base_state = self.twin.reset()
        self._composition_keys = sorted(base_state.composition_pct.keys())
        self._slag_keys = sorted(base_state.slag_state.keys())
        self.actions = [
            AlloyAction(name=alloy, mass_kg=float(bucket))
            for alloy in cfg.alloy_catalog
            for bucket in cfg.action_bucket_kg
        ]
        obs_dim = len(self._state_vector(base_state))
        self._obs_dim = obs_dim
        action_dim = len(self.actions)
        self.actor = _MLP(obs_dim, action_dim, cfg.hidden_sizes).to(self.device)
        self.critic = _MLP(obs_dim, 1, cfg.hidden_sizes).to(self.device)
        self.optimizer = torch.optim.Adam(
            list(self.actor.parameters()) + list(self.critic.parameters()),
            lr=cfg.learning_rate,
        )
        plant_cfg = getattr(self.twin, "_plant_cfg", None)
        if plant_cfg is None:
            raise AttributeError("SteelmakingDigitalTwin must expose _plant_cfg for cloning")
        self._plant_cfg_snapshot = copy.deepcopy(plant_cfg)
        loss_models = getattr(self.twin, "_loss_models", None)
        self._loss_models_snapshot = copy.deepcopy(loss_models)
        self._alloy_catalog_snapshot = copy.deepcopy(
            getattr(self.twin, "_raw_alloy_catalog", None)
        )

    @classmethod
    def from_checkpoint(
        cls,
        twin: SteelmakingDigitalTwin,
        checkpoint_path: str,
        device: str | None = None,
        seed: int | None = None,
    ) -> "AlloyControlAgent":
        payload = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        cfg_dict = payload.get("config", {})
        cfg = RLAgentConfig(**cfg_dict)
        if seed is not None:
            cfg.seed = seed
        if device:
            cfg.device = device
        agent = cls(twin, cfg)
        agent.actor.load_state_dict(payload["actor_state"])
        agent.critic.load_state_dict(payload["critic_state"])
        agent.actor.eval()
        agent.critic.eval()
        agent._composition_keys = payload.get("composition_keys", agent._composition_keys)
        agent._slag_keys = payload.get("slag_keys", agent._slag_keys)
        stored_actions = payload.get("actions")
        if stored_actions:
            agent.actions = [AlloyAction(name=name, mass_kg=mass) for name, mass in stored_actions]
        return agent

    def act(self, state: ProcessState, greedy: bool = False) -> AlloyAction:
        obs = torch.tensor(self._state_vector(state), dtype=torch.float32, device=self.device)
        with torch.no_grad():
            logits = self.actor(obs.unsqueeze(0)).squeeze(0)
            dist = Categorical(logits=logits)
            if greedy:
                action_idx = torch.argmax(dist.probs)
            else:
                action_idx = dist.sample()
        return self.actions[int(action_idx.item())]

    def train(self, episodes: int = 10) -> Dict[str, float]:
        """Run PPO on twin-generated rollouts and persist the learned policy."""

        rollout = self._collect_rollout(episodes)
        advantages, returns = self._compute_advantages(
            rollout["rewards"], rollout["values"], rollout["dones"]
        )
        observations = rollout["observations"]
        actions = rollout["actions"]
        old_log_probs = rollout["log_probs"]

        advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)
        batch_size = observations.shape[0]
        for epoch in range(self.cfg.update_epochs):
            permutation = torch.randperm(batch_size, device=self.device)
            for start in range(0, batch_size, self.cfg.minibatch_size):
                idx = permutation[start : start + self.cfg.minibatch_size]
                self._ppo_update(
                    observations[idx],
                    actions[idx],
                    old_log_probs[idx],
                    advantages[idx],
                    returns[idx],
                )
            LOGGER.info("PPO epoch=%s complete", epoch + 1)

        mean_reward = float(torch.tensor(rollout["episode_rewards"], device=self.device).mean().item())
        policy_artifact = self._save_checkpoint()
        return {
            "mean_reward": mean_reward,
            "episodes": episodes,
            "policy": policy_artifact.path,
        }

    @torch.inference_mode()
    def evaluate(self, episodes: int = 5, deterministic: bool = True) -> Dict[str, float]:
        """Run the current policy without updates and report summary metrics."""

        rewards: List[float] = []
        steps_taken: List[int] = []
        self.actor.eval()
        for ep in range(episodes):
            state = self.twin.reset()
            done = False
            total_reward = 0.0
            steps = 0
            while not done and steps < self.cfg.rollout_horizon:
                action = self.act(state, greedy=deterministic)
                state, reward, done, _ = self.twin.step(action)
                total_reward += reward
                steps += 1
            rewards.append(float(total_reward))
            steps_taken.append(steps)
        return {
            "mean_reward": float(np.mean(rewards) if rewards else 0.0),
            "std_reward": float(np.std(rewards) if rewards else 0.0),
            "episodes": episodes,
            "avg_steps": float(np.mean(steps_taken) if steps_taken else 0.0),
        }

    def _ppo_update(
        self,
        observations: torch.Tensor,
        actions: torch.Tensor,
        old_log_probs: torch.Tensor,
        advantages: torch.Tensor,
        returns: torch.Tensor,
    ) -> None:
        logits = self.actor(observations)
        dist = Categorical(logits=logits)
        log_probs = dist.log_prob(actions)
        entropy = dist.entropy().mean()

        ratios = torch.exp(log_probs - old_log_probs)
        clipped = torch.clamp(ratios, 1.0 - self.cfg.clip_epsilon, 1.0 + self.cfg.clip_epsilon)
        policy_loss = -torch.min(ratios * advantages, clipped * advantages).mean()

        values = self.critic(observations).squeeze(-1)
        value_loss = torch.nn.functional.mse_loss(values, returns)

        loss = policy_loss + self.cfg.value_coef * value_loss - self.cfg.entropy_coef * entropy
        self.optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(
            list(self.actor.parameters()) + list(self.critic.parameters()), 1.0
        )
        self.optimizer.step()

    def _spawn_envs(self) -> List[SteelmakingDigitalTwin]:
        count = max(1, int(self.cfg.env_parallelism))
        envs = []
        for env_idx in range(count):
            env_seed = self._base_seed + env_idx + 1
            envs.append(self._clone_twin(seed=env_seed))
        return envs

    def _clone_twin(self, seed: int | None = None) -> SteelmakingDigitalTwin:
        return SteelmakingDigitalTwin(
            copy.deepcopy(self._plant_cfg_snapshot),
            loss_models=copy.deepcopy(self._loss_models_snapshot),
            alloy_catalog=copy.deepcopy(self._alloy_catalog_snapshot),
            seed=seed,
        )

    def _collect_rollout(self, episodes: int) -> Dict[str, torch.Tensor]:
        observations: List[torch.Tensor] = []
        actions: List[int] = []
        log_probs: List[torch.Tensor] = []
        rewards: List[float] = []
        dones: List[float] = []
        values: List[torch.Tensor] = []
        episode_returns: List[float] = []

        envs = self._spawn_envs()
        env_states = [env.reset() for env in envs]
        env_steps = [0 for _ in envs]
        env_returns = [0.0 for _ in envs]

        while len(episode_returns) < episodes:
            for env_idx, env in enumerate(envs):
                if len(episode_returns) >= episodes:
                    break
                state = env_states[env_idx]
                obs_vec = torch.tensor(
                    self._state_vector(state), dtype=torch.float32, device=self.device
                )
                logits = self.actor(obs_vec.unsqueeze(0)).squeeze(0)
                dist = Categorical(logits=logits)
                action_idx = dist.sample()
                value = self.critic(obs_vec.unsqueeze(0)).squeeze(0)

                action = self.actions[int(action_idx.item())]
                next_state, reward, done, _ = env.step(action)

                observations.append(obs_vec)
                actions.append(int(action_idx.item()))
                log_probs.append(dist.log_prob(action_idx).detach())
                values.append(value.detach())
                rewards.append(float(reward))

                env_steps[env_idx] += 1
                env_returns[env_idx] += reward
                env_states[env_idx] = next_state

                terminated = done or env_steps[env_idx] >= self.cfg.rollout_horizon
                dones.append(float(terminated))
                if terminated:
                    episode_reward = float(env_returns[env_idx])
                    episode_returns.append(episode_reward)
                    LOGGER.info(
                        "RL episode=%s reward=%.2f",
                        len(episode_returns),
                        episode_reward,
                    )
                    env_states[env_idx] = env.reset()
                    env_steps[env_idx] = 0
                    env_returns[env_idx] = 0.0

        return {
            "observations": torch.stack(observations),
            "actions": torch.tensor(actions, dtype=torch.long, device=self.device),
            "log_probs": torch.stack(log_probs),
            "rewards": torch.tensor(rewards, dtype=torch.float32, device=self.device),
            "dones": torch.tensor(dones, dtype=torch.float32, device=self.device),
            "values": torch.stack(values).squeeze(-1),
            "episode_rewards": episode_returns,
        }

    def _compute_advantages(
        self, rewards: torch.Tensor, values: torch.Tensor, dones: torch.Tensor
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        advantages = torch.zeros_like(rewards)
        gae = 0.0
        next_value = 0.0
        for t in reversed(range(len(rewards))):
            mask = 1.0 - dones[t].item()
            delta = rewards[t].item() + self.cfg.gamma * next_value * mask - values[t].item()
            gae = delta + self.cfg.gamma * self.cfg.gae_lambda * mask * gae
            advantages[t] = gae
            next_value = values[t].item()
        returns = advantages + values
        return advantages, returns

    def _save_checkpoint(self) -> PolicyArtifact:
        policy_path = Path("experiments/rl/policy.pt")
        policy_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "actor_state": self.actor.state_dict(),
            "critic_state": self.critic.state_dict(),
            "config": asdict(self.cfg),
            "composition_keys": self._composition_keys,
            "slag_keys": self._slag_keys,
            "actions": [(action.name, action.mass_kg) for action in self.actions],
        }
        torch.save(payload, policy_path)
        return PolicyArtifact(
            path=str(policy_path),
            config=payload["config"],
            actions=payload["actions"],
            composition_keys=list(self._composition_keys),
            slag_keys=list(self._slag_keys),
        )

    @staticmethod
    def _select_device(preferred: str) -> torch.device:
        if preferred.lower() == "auto":
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return torch.device(preferred)

    def _state_vector(self, state: ProcessState) -> List[float]:
        vector: List[float] = [state.temperature_c / 2000.0]
        vector.extend(state.composition_pct.get(el, 0.0) for el in self._composition_keys)
        vector.extend(state.slag_state.get(el, 0.0) / 100 for el in self._slag_keys)
        vector.append(state.cumulative_alloy_cost / 100000.0)
        return vector

    def export_actor(self, output_path: str, fmt: str = "torchscript") -> str:
        """Serialize the actor network for deployment (TorchScript or ONNX)."""

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        self.actor.eval()
        fmt_normalized = fmt.lower()
        if fmt_normalized == "torchscript":
            example = torch.zeros(1, self._obs_dim, dtype=torch.float32, device=self.device)
            traced = torch.jit.trace(self.actor, example)
            traced.save(output_path)
        elif fmt_normalized == "onnx":
            actor_cpu = copy.deepcopy(self.actor).to("cpu")
            example = torch.zeros(1, self._obs_dim, dtype=torch.float32)
            torch.onnx.export(
                actor_cpu,
                example,
                output_path,
                input_names=["state"],
                output_names=["logits"],
                dynamic_axes={"state": {0: "batch"}, "logits": {0: "batch"}},
                opset_version=15,
            )
        else:
            raise ValueError("fmt must be either 'torchscript' or 'onnx'")
        return output_path

    @staticmethod
    def interpret_reward(reward: float) -> RewardBreakdown:
        return RewardBreakdown(
            grade_hit=max(0.0, reward * 0.6),
            alloy_cost=-abs(reward) * 0.2,
            temperature_penalty=-abs(reward) * 0.15,
            emission_penalty=-abs(reward) * 0.05,
        )
