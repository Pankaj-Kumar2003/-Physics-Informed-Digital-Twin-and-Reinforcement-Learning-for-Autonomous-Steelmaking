from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from common.config import load_config
from common.logging import get_logger
from common.types import AlloyAction
from digital_twin.simulator import SteelmakingDigitalTwin

LOGGER = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate synthetic twin rollouts")
    parser.add_argument("--config", default="config/default.yaml")
    parser.add_argument("--output", default="data/processed/twin_rollouts.npy")
    parser.add_argument("--episodes", type=int, default=100)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(cfg.plant)
    rollouts = []
    for episode in range(args.episodes):
        twin.reset()
        episode_states = []
        for _ in range(30):
            action = AlloyAction(name="FeSi", mass_kg=10.0)
            state, reward, done, _ = twin.step(action)
            episode_states.append((state.temperature_c, state.composition_pct))
            if done:
                break
        rollouts.append(episode_states)
        LOGGER.info("Generated episode=%s len=%s", episode, len(episode_states))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.save(output, rollouts)
    LOGGER.info("Saved synthetic dataset to %s", output)


if __name__ == "__main__":
    main()
