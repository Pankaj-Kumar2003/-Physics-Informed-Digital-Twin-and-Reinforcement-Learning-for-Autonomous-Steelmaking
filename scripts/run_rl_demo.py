from __future__ import annotations

import argparse
import json
import random
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import torch

from common.config import load_config
from common.logging import get_logger
from common.types import AlloyAction, ProcessState
from digital_twin.simulator import SteelmakingDigitalTwin
from rl_agent.agent import AlloyControlAgent, RLAgentConfig

LOGGER = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Drive the digital twin with the RL policy")
    parser.add_argument("--config", default="config/default.yaml")
    parser.add_argument("--episodes", type=int, default=1)
    parser.add_argument("--policy", default="experiments/rl/policy.pt")
    parser.add_argument("--deterministic", action="store_true")
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--warmup-episodes", type=int, default=12)
    parser.add_argument("--force-warmup", action="store_true")
    return parser.parse_args()


def _set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def _serialize_action(action: AlloyAction | None) -> Dict[str, Any] | None:
    if action is None:
        return None
    return {
        "name": action.name,
        "mass_kg": action.mass_kg,
        "injection_route": action.injection_route,
    }


def _telemetry_row(
    *,
    step: int,
    state: ProcessState,
    reward: float | None,
    action: AlloyAction | None,
    info: Dict[str, Any] | None,
) -> Dict[str, Any]:
    basicity = None
    carbon_pct = state.composition_pct.get("C", 0.0)
    feo_pct = state.slag_state.get("FeO", 0.0)
    energy = {}
    mass_added = None
    if info:
        basicity = info.get("basicity", basicity)
        carbon_pct = info.get("carbon_pct", carbon_pct)
        feo_pct = info.get("feo_pct", feo_pct)
        energy = info.get("energy", {})
        mass_added = info.get("mass_added_kg", mass_added)
    row: Dict[str, Any] = {
        "step": step,
        "temperature_c": state.temperature_c,
        "composition": state.composition_pct,
        "slag": state.slag_state,
        "basicity": basicity,
        "reward": reward,
        "energy": energy,
        "carbon_pct": carbon_pct,
        "feo_pct": feo_pct,
        "action": _serialize_action(action),
        "mass_added_kg": mass_added,
    }
    if reward is not None:
        row["reward_breakdown"] = asdict(AlloyControlAgent.interpret_reward(reward))
    return row


def _run_episode(
    twin: SteelmakingDigitalTwin,
    agent: AlloyControlAgent,
    *,
    deterministic: bool,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any], List[Dict[str, Any]]]:
    telemetry: List[Dict[str, Any]] = []
    plan: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    state = twin.reset()
    telemetry.append(_telemetry_row(step=0, state=state, reward=None, action=None, info=None))

    total_reward = 0.0
    steps = 0
    max_temp = state.temperature_c
    min_temp = state.temperature_c

    while steps < agent.cfg.rollout_horizon:
        action = agent.act(state, greedy=deterministic)
        next_state, reward, done, info = twin.step(action)
        serialized_action = _serialize_action(action)
        if serialized_action:
            plan.append(serialized_action)
        telemetry.append(
            _telemetry_row(
                step=steps + 1,
                state=next_state,
                reward=reward,
                action=action,
                info=info,
            )
        )
        events.append(
            {
                "step": steps + 1,
                "description": (
                    f"{action.name} {action.mass_kg:.1f} kg -> "
                    f"T {next_state.temperature_c:.0f} C, reward {reward:.2f}"
                ),
            }
        )
        total_reward += reward
        steps += 1
        state = next_state
        max_temp = max(max_temp, state.temperature_c)
        min_temp = min(min_temp, state.temperature_c)
        if done:
            break

    summary = {
        "steps": steps,
        "max_temperature_c": max_temp,
        "min_temperature_c": min_temp,
        "final_temperature_c": state.temperature_c,
        "final_carbon_pct": state.composition_pct.get("C", 0.0),
        "final_basicity": telemetry[-1].get("basicity"),
        "total_reward": total_reward,
        "reward_mean": total_reward / steps if steps else 0.0,
    }
    events.append(
        {
            "step": steps,
            "description": (
                f"Episode complete after {steps} steps · total reward {total_reward:.2f} · "
                f"final carbon {summary['final_carbon_pct']:.3f}"
            ),
        }
    )
    return plan, telemetry, summary, events


def main() -> None:
    args = parse_args()
    _set_seed(args.seed)
    project_cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(
        project_cfg.plant,
        alloy_catalog=project_cfg.alloys,
        seed=args.seed,
    )

    policy_path = Path(args.policy)
    if policy_path.exists():
        LOGGER.info("Loading RL policy from %s", policy_path)
        agent = AlloyControlAgent.from_checkpoint(
            twin,
            str(policy_path),
            device="cpu",
            seed=args.seed,
        )
        policy_source = str(policy_path)
    else:
        LOGGER.info("No policy checkpoint found at %s - using fresh agent", policy_path)
        agent = AlloyControlAgent(twin, RLAgentConfig(seed=args.seed))
        policy_source = "random-init"

    warmup_metrics: Dict[str, Any] | None = None
    should_warmup = args.warmup_episodes > 0 and (not policy_path.exists() or args.force_warmup)
    if should_warmup:
        LOGGER.info("Running quick warmup training for %s episodes", args.warmup_episodes)
        warmup_metrics = agent.train(episodes=args.warmup_episodes)
        agent.actor.eval()
        agent.critic.eval()

    best_episode: Dict[str, Any] | None = None
    reward_trace: List[float] = []

    for episode in range(max(1, args.episodes)):
        plan, telemetry, summary, events = _run_episode(
            twin,
            agent,
            deterministic=args.deterministic,
        )
        reward_trace.append(float(summary["total_reward"]))
        candidate = {
            "plan": plan,
            "telemetry": telemetry,
            "summary": summary,
            "events": events,
            "episode_index": episode + 1,
        }
        if best_episode is None or summary["total_reward"] >= best_episode["summary"]["total_reward"]:
            best_episode = candidate

    mean_reward = sum(reward_trace) / len(reward_trace) if reward_trace else 0.0
    variance = (
        sum((value - mean_reward) ** 2 for value in reward_trace) / len(reward_trace)
        if reward_trace
        else 0.0
    )
    aggregate = {
        "episodes": len(reward_trace),
        "mean_reward": mean_reward,
        "std_reward": variance**0.5,
        "reward_trace": reward_trace,
    }

    payload = {
        "ok": True,
        "config_path": args.config,
        "policy_source": policy_source,
        "deterministic": args.deterministic,
        "aggregate": aggregate,
        "seed": args.seed,
        "warmup": warmup_metrics,
    }
    if best_episode:
        payload.update(best_episode)
    print(json.dumps(payload))


if __name__ == "__main__":
    main()
