from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

from common.config import load_config
from common.logging import get_logger
from common.types import AlloyAction, OrchestratorArtifacts, ProcessState
from digital_twin.simulator import SteelmakingDigitalTwin
from optimizer.nsga2 import MultiObjectiveOptimizer, Objective
from piml.model import train_model
from rl_agent.agent import AlloyControlAgent, RLAgentConfig

LOGGER = get_logger(__name__)


@dataclass
class OrchestratorConfig:
    config_path: str


class SteelmakingOrchestrator:
    """Coordinates data generation, surrogate modeling, optimization, and RL."""

    def __init__(self, cfg: OrchestratorConfig) -> None:
        self._cfg = cfg
        self._project_cfg = load_config(cfg.config_path)
        self._twin = SteelmakingDigitalTwin(
            self._project_cfg.plant,
            alloy_catalog=self._project_cfg.alloys,
        )
        self._optimizer = self._build_optimizer()
        self._rl_agent = AlloyControlAgent(self._twin, RLAgentConfig())

    def _build_optimizer(self) -> MultiObjectiveOptimizer:
        def cost(state: ProcessState, plan: List[AlloyAction]) -> float:
            cost_total = sum(action.mass_kg * 1000 for action in plan)
            return -cost_total

        def grade_accuracy(state: ProcessState, plan: List[AlloyAction]) -> float:
            return 1.0 - abs(0.04 - state.composition_pct.get("C", 0.0))

        objectives = [
            Objective(name="cost", weight=0.4, function=cost),
            Objective(name="grade_accuracy", weight=0.6, function=grade_accuracy),
        ]
        return MultiObjectiveOptimizer(objectives)

    def run(self) -> OrchestratorArtifacts:
        """Execute the full pipeline end-to-end for a single config."""

        LOGGER.info("1) Generating synthetic rollouts from the digital twin")
        initial_plan = [AlloyAction(name="FeSi", mass_kg=10.0) for _ in range(5)]
        twin_batch = self._twin.rollout(initial_plan)

        LOGGER.info("2) Training physics-informed surrogate")
        piml_metrics = train_model(twin_batch)

        LOGGER.info("3) Optimizing static alloy plan")
        optimized_plan = self._optimizer.optimize(self._twin.reset(), initial_plan)

        LOGGER.info("4) Training reinforcement learning agent")
        rl_metrics = self._rl_agent.train()

        LOGGER.info("Artifacts: piml=%s rl=%s", piml_metrics, rl_metrics)

        artifacts = OrchestratorArtifacts(
            piml_checkpoint=piml_metrics["checkpoint"],
            optimizer_plan="experiments/plan.json",
            rl_policy="experiments/rl/policy.pt",
            config_path=self._cfg.config_path,
        )
        self._write_plan_stub(optimized_plan)
        return artifacts

    def _write_plan_stub(self, result) -> None:
        path = Path("experiments/plan.json")
        path.parent.mkdir(parents=True, exist_ok=True)
        content = {
            "metrics": result.metrics,
            "plan": [action.__dict__ for action in result.recommended_plan],
        }
        path.write_text(str(content), encoding="utf-8")
