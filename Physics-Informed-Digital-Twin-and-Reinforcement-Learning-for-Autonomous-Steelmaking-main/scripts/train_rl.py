from __future__ import annotations

import argparse

from common.config import load_config
from common.logging import get_logger
from digital_twin.simulator import SteelmakingDigitalTwin
from rl_agent.agent import AlloyControlAgent, RLAgentConfig

LOGGER = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train reinforcement learning agent")
    parser.add_argument("--config", default="config/default.yaml")
    parser.add_argument("--episodes", type=int, default=20)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(cfg.plant)
    agent = AlloyControlAgent(twin, RLAgentConfig())
    metrics = agent.train(episodes=args.episodes)
    LOGGER.info("Trained RL agent metrics=%s", metrics)


if __name__ == "__main__":
    main()
