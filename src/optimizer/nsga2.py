from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List

import numpy as np

from common.types import AlloyAction, OptimizationResult, ProcessState


@dataclass
class Objective:
    name: str
    weight: float
    function: Callable[[ProcessState, List[AlloyAction]], float]


class MultiObjectiveOptimizer:
    """Minimal NSGA-II style optimizer placeholder."""

    def __init__(self, objectives: List[Objective], population_size: int = 32) -> None:
        self.objectives = objectives
        self.population_size = population_size

    def optimize(self, state: ProcessState, candidate_pool: List[AlloyAction]) -> OptimizationResult:
        """Search alloy sequences in a coarse NSGA-II inspired fashion."""

        populations = [self._random_plan(candidate_pool) for _ in range(self.population_size)]
        scores = [self._score_plan(state, plan) for plan in populations]
        best_idx = int(np.argmax([score["grade_accuracy"] for score in scores]))
        return OptimizationResult(
            pareto_front=scores,
            recommended_plan=populations[best_idx],
            metrics=scores[best_idx],
        )

    def _random_plan(self, pool: List[AlloyAction]) -> List[AlloyAction]:
        num_steps = np.random.randint(2, 6)
        return list(np.random.choice(pool, size=num_steps, replace=True))

    def _score_plan(self, state: ProcessState, plan: List[AlloyAction]) -> Dict[str, float]:
        metrics = {}
        for objective in self.objectives:
            metrics[objective.name] = objective.function(state, plan)
        return metrics
