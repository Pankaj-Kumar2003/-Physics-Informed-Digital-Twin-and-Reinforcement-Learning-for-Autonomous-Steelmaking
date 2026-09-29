from __future__ import annotations

import argparse

from src.common.config import load_config
from src.digital_twin.simulator import SteelmakingDigitalTwin
from src.rl_agent.agent import AlloyControlAgent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate a trained RL policy on the digital twin")
    parser.add_argument(
        "--config",
        default="config/default.yaml",
        help="Path to orchestrator YAML config used to build the digital twin",
    )
    parser.add_argument(
        "--checkpoint",
        required=True,
        help="Path to the saved PPO checkpoint (e.g., experiments/rl/policy.pt)",
    )
    parser.add_argument(
        "--episodes",
        type=int,
        default=5,
        help="Number of rollouts to average over",
    )
    parser.add_argument(
        "--stochastic",
        action="store_true",
        help="If set, sample from the policy distribution instead of taking greedy actions",
    )
    parser.add_argument(
        "--device",
        default="auto",
        help="Override the inference device (auto|cpu|cuda)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    project_cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(project_cfg.plant)
    agent = AlloyControlAgent.from_checkpoint(twin, args.checkpoint, device=args.device)
    metrics = agent.evaluate(episodes=args.episodes, deterministic=not args.stochastic)
    print("Evaluation metrics:")
    for key, value in metrics.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
