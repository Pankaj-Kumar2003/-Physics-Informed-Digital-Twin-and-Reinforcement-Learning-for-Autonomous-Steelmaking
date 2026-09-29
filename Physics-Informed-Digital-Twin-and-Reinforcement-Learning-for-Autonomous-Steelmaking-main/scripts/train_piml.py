from __future__ import annotations

import argparse

from common.config import load_config
from common.logging import get_logger
from digital_twin.simulator import SteelmakingDigitalTwin
from piml.model import PINNConfig, train_model

LOGGER = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train physics-informed surrogate")
    parser.add_argument("--config", default="config/default.yaml")
    parser.add_argument("--epochs", type=int, default=25)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(cfg.plant)
    batch = twin.rollout([])
    pinn_cfg = PINNConfig(epochs=args.epochs)
    metrics = train_model(batch, cfg=pinn_cfg)
    LOGGER.info("Finished training with metrics=%s", metrics)


if __name__ == "__main__":
    main()
