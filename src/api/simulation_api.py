from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator

from common.config import load_config, ProjectConfig
from common.types import AlloyAction
from digital_twin.simulator import SteelmakingDigitalTwin

app = FastAPI(
    title="Steelmaking Twin Simulation API",
    version="1.0.0",
    description="Run high-fidelity digital twin scenarios and stream telemetry for visualization.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_last_result: Dict[str, Any] | None = None


class AlloyActionPayload(BaseModel):
    name: str
    mass_kg: float = Field(..., gt=0.0)
    injection_route: str | None = "bulk"

    @validator("name")
    def _normalize_name(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("Alloy name cannot be empty")
        return trimmed


class SimulationRequest(BaseModel):
    config_path: str = "config/default.yaml"
    plan: List[AlloyActionPayload] = Field(default_factory=list)
    auto_fill_plan: bool = True
    max_steps: int | None = Field(default=None, ge=1, le=200)


def _default_plan(cfg: ProjectConfig) -> List[AlloyAction]:
    catalog = cfg.alloys.get("catalog", []) if cfg.alloys else []
    if not catalog:
        return [
            AlloyAction(name="FeSi", mass_kg=8.0),
            AlloyAction(name="FeMn", mass_kg=6.0),
            AlloyAction(name="Ni", mass_kg=2.5),
        ]
    template_masses = [8.0, 6.0, 5.0, 3.0]
    actions: List[AlloyAction] = []
    for idx, entry in enumerate(catalog[: len(template_masses)]):
        actions.append(
            AlloyAction(
                name=entry.get("name", f"Alloy-{idx}"),
                mass_kg=template_masses[idx],
            )
        )
    return actions


def _plan_from_payloads(payload: SimulationRequest, cfg: ProjectConfig) -> List[AlloyAction]:
    if payload.plan:
        return [
            AlloyAction(name=item.name, mass_kg=item.mass_kg, injection_route=item.injection_route or "bulk")
            for item in payload.plan
        ]
    if payload.auto_fill_plan:
        return _default_plan(cfg)
    raise HTTPException(status_code=400, detail="No plan provided and auto_fill_plan=False")


def _serialize_step(step_state) -> Dict[str, Any]:
    state, reward, info, action_dict = step_state
    basicity = info.get("basicity") if info else 0.0
    telemetry = {
        "step": state.time_step,
        "temperature_c": state.temperature_c,
        "composition": state.composition_pct,
        "slag": state.slag_state,
        "basicity": basicity,
        "reward": reward,
        "energy": info.get("energy", {}) if info else {},
        "carbon_pct": info.get("carbon_pct", state.composition_pct.get("C", 0.0)),
        "feo_pct": info.get("feo_pct", state.slag_state.get("FeO", 0.0)),
        "action": action_dict,
    }
    return telemetry


def _simulate(cfg: ProjectConfig, plan: List[AlloyAction], max_steps: int | None) -> Dict[str, Any]:
    twin = SteelmakingDigitalTwin(
        cfg.plant,
        alloy_catalog=cfg.alloys,
    )
    telemetry: List[Dict[str, Any]] = []
    initial_state = twin.reset()
    telemetry.append(
        {
            "step": initial_state.time_step,
            "temperature_c": initial_state.temperature_c,
            "composition": initial_state.composition_pct,
            "slag": initial_state.slag_state,
            "basicity": (initial_state.slag_state.get("CaO", 45.0) + 1e-3)
            / (initial_state.slag_state.get("SiO2", 12.0) + 1e-3),
            "reward": None,
            "energy": {},
            "carbon_pct": initial_state.composition_pct.get("C", 0.0),
            "feo_pct": initial_state.slag_state.get("FeO", 18.0),
            "action": None,
        }
    )

    horizon = max_steps or 60
    for action in plan:
        state, reward, done, info = twin.step(action)
        telemetry.append(
            _serialize_step(
                (
                    state,
                    reward,
                    info or {},
                    {"name": action.name, "mass_kg": action.mass_kg},
                )
            )
        )
        if done or state.time_step >= horizon:
            break

    summary = _summaries_from_telemetry(telemetry)
    return {"telemetry": telemetry, "summary": summary}


def _summaries_from_telemetry(telemetry: List[Dict[str, Any]]) -> Dict[str, Any]:
    temps = [point["temperature_c"] for point in telemetry]
    carbons = [point.get("carbon_pct", 0.0) for point in telemetry]
    rewards = [point["reward"] for point in telemetry if point["reward"] is not None]
    basicities = [point.get("basicity", 0.0) for point in telemetry]
    return {
        "max_temperature_c": max(temps) if temps else None,
        "min_temperature_c": min(temps) if temps else None,
        "final_temperature_c": temps[-1] if temps else None,
        "final_carbon_pct": carbons[-1] if carbons else None,
        "final_basicity": basicities[-1] if basicities else None,
        "reward_mean": sum(rewards) / len(rewards) if rewards else None,
        "steps": len(telemetry) - 1,
    }


@app.post("/twin/run")
async def run_twin(payload: SimulationRequest) -> Dict[str, Any]:
    config_path = Path(payload.config_path)
    if not config_path.exists():
        raise HTTPException(status_code=404, detail=f"Config file not found: {payload.config_path}")
    cfg = load_config(config_path)
    plan = _plan_from_payloads(payload, cfg)
    result = _simulate(cfg, plan, payload.max_steps)
    response = {
        "config_path": payload.config_path,
        "plan": [item.dict() for item in payload.plan] if payload.plan else [
            {"name": action.name, "mass_kg": action.mass_kg} for action in plan
        ],
        "telemetry": result["telemetry"],
        "summary": result["summary"],
    }
    global _last_result
    _last_result = response
    return response


@app.get("/twin/state")
async def last_state() -> Dict[str, Any]:
    if _last_result is None:
        raise HTTPException(status_code=404, detail="No simulation has been run yet")
    return _last_result
