from __future__ import annotations

import argparse

from common.config import load_config
from common.logging import get_logger
from common.types import AlloyAction
from digital_twin.simulator import SteelmakingDigitalTwin
from optimizer.nsga2 import MultiObjectiveOptimizer, Objective

LOGGER = get_logger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run alloy optimization")
    parser.add_argument("--config", default="config/default.yaml")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    cfg = load_config(args.config)
    twin = SteelmakingDigitalTwin(cfg.plant)

    def cost(state, plan):
        return -sum(a.mass_kg for a in plan)

    def accuracy(state, plan):
        return 1.0 - abs(0.04 - state.composition_pct.get("C", 0.0))

    optimizer = MultiObjectiveOptimizer(
        [
            Objective("cost", 0.4, cost),
            Objective("grade_accuracy", 0.6, accuracy),
        ]
    )
    plan = [AlloyAction(name="FeSi", mass_kg=10.0) for _ in range(5)]
    result = optimizer.optimize(twin.reset(), plan)
    LOGGER.info("Optimization metrics=%s", result.metrics)


if __name__ == "__main__":
    main()
