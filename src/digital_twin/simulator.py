from __future__ import annotations

import random
from typing import Dict, Iterable, List, Tuple

import numpy as np

from common.logging import get_logger
from common.types import AlloyAction, ProcessState, TwinBatch

LOGGER = get_logger(__name__)

SIGMA = 5.670374419e-8  # Stefan-Boltzmann constant (W/m^2/K^4)

REACTION_HEAT_KJ_PER_KG = {
    "C": 32700.0,  # C + O2 -> CO2 (approx.)
    "Si": 16700.0,
    "Mn": 6900.0,
}

DEFAULT_ALLOY_LIBRARY = {
    "fesi": {"elements": {"Si": 0.75}, "unit_cost_usd_per_kg": 1.95},
    "femn": {"elements": {"Mn": 0.80}, "unit_cost_usd_per_kg": 2.10},
    "ni": {"elements": {"Ni": 0.99}, "unit_cost_usd_per_kg": 15.50},
    "mo": {"elements": {"Mo": 0.98}, "unit_cost_usd_per_kg": 36.40},
}


class SteelmakingDigitalTwin:
    """Simplified but extensible stochastic simulator.

    The twin is purposely modular so that detailed thermodynamic models can
    replace the placeholder kinetics without reworking downstream consumers.
    """

    def __init__(
        self,
        plant_cfg: Dict,
        loss_models: Dict[str, Tuple[float, float]] | None = None,
        seed: int | None = None,
        alloy_catalog: Dict | None = None,
    ) -> None:
        self._plant_cfg = plant_cfg
        self._seed = seed if seed is not None else random.randrange(1, 1_000_000_000)
        self._rng = random.Random(self._seed)
        self._raw_alloy_catalog = alloy_catalog
        self._loss_models = loss_models or {
            "carbon": (0.03, 0.08),
            "manganese": (0.10, 0.25),
            "silicon": (0.15, 0.35),
        }
        self._dt_min = float(self._plant_cfg.get("simulation_timestep_min", 1.0))
        self._dt_sec = self._dt_min * 60.0
        self._ambient_c = float(self._plant_cfg.get("ambient_temperature_c", 25.0))
        self._steel_mass_kg = float(self._plant_cfg.get("steel_mass_tonnes", 150.0)) * 1000.0
        self._bath_cp_kj = float(self._plant_cfg.get("bath_specific_heat_kj_per_kgk", 0.75))
        self._alloy_cp_kj = float(self._plant_cfg.get("alloy_specific_heat_kj_per_kgk", 0.60))
        self._arc_power_mw = float(self._plant_cfg.get("arc_power_mw", 70.0))
        self._arc_efficiency = float(self._plant_cfg.get("arc_efficiency", 0.78))
        self._surface_area_m2 = float(self._plant_cfg.get("bath_surface_area_m2", 55.0))
        self._conv_coeff_kw = float(
            self._plant_cfg.get("convective_loss_kw_per_m2k", 0.45)
        )
        self._emissivity = float(self._plant_cfg.get("radiation_emissivity", 0.8))
        self._basicity_target = float(self._plant_cfg.get("slag_basicity_target", 3.0))
        self._carbon_rate = float(
            self._plant_cfg.get("carbon_oxidation_rate_pct_per_min", 0.015)
        )
        self._alloy_library = self._build_alloy_library(alloy_catalog)
        self._price_table = {
            name: props.get("unit_cost_usd_per_kg", 2500.0)
            for name, props in self._alloy_library.items()
        }
        self.reset()

    def reset(self) -> ProcessState:
        """Reset the furnace to a base condition."""

        self._step = 0
        base_comp = {"C": 0.45, "Mn": 0.60, "Si": 0.20, "P": 0.012}
        slag_state = {"FeO": 18.0, "SiO2": 12.0, "CaO": 45.0}
        self._state = ProcessState(
            time_step=self._step,
            temperature_c=self._plant_cfg.get("tap_temperature_c", 1650),
            composition_pct=base_comp,
            slag_state=slag_state,
        )
        return self._state

    def step(self, action: AlloyAction) -> Tuple[ProcessState, float, bool, Dict]:
        """Apply an alloy addition and evolve the furnace using energy & mass balances."""

        self._step += 1
        composition = dict(self._state.composition_pct)
        slag_state = dict(self._state.slag_state)

        mass_added = self._apply_alloy_addition(composition, action)
        chem_heat = self._apply_carbon_oxidation(composition, slag_state)
        slag_state = self._update_slag_state(action, slag_state)
        temperature, energy_terms = self._update_temperature(mass_added, chem_heat)
        basicity = self._compute_basicity(slag_state)

        self._state = ProcessState(
            time_step=self._step,
            temperature_c=temperature,
            composition_pct=composition,
            slag_state=slag_state,
            cumulative_alloy_cost=self._state.cumulative_alloy_cost
            + self._estimate_cost(action),
        )
        reward = self._compose_reward()
        terminated = (
            self._step >= 60
            or temperature < 1500
            or composition.get("C", 0.0) < 0.02
        )
        info = {
            "mass_added_kg": mass_added,
            "chem_heat_kj": chem_heat,
            "basicity": basicity,
            "carbon_pct": composition.get("C", 0.0),
            "feo_pct": slag_state.get("FeO", 18.0),
            "reward": reward,
            "energy": energy_terms,
        }
        return self._state, reward, terminated, info

    def rollout(self, actions: Iterable[AlloyAction]) -> TwinBatch:
        """Simulate a full heat for offline dataset generation."""

        plan = list(actions)
        if not plan:
            plan = [AlloyAction(name="FeSi", mass_kg=5.0)]
        executed_actions: list[AlloyAction] = []
        states = [self.reset()]
        rewards: list[float] = []
        for action in plan:
            executed_actions.append(action)
            state, reward, done, _ = self.step(action)
            states.append(state)
            rewards.append(reward)
            if done:
                break
        metadata = {"steps": str(len(executed_actions))}
        return TwinBatch(states=states, actions=executed_actions, targets={"reward": rewards}, metadata=metadata)

    def _apply_alloy_addition(self, composition: Dict[str, float], action: AlloyAction) -> float:
        """Mass balance: converts alloy addition into wt%% increments."""

        entry = self._alloy_library.get(action.name.lower())
        if not entry:
            return 0.0
        recovery_mu, recovery_sigma = self._loss_models.get(
            action.name.lower(), (0.85, 0.05)
        )
        recovery = float(np.clip(self._rng.gauss(recovery_mu, recovery_sigma), 0.1, 0.98))
        total_added = 0.0
        for element, share in entry.get("elements", {}).items():
            added_mass = action.mass_kg * share * recovery
            delta_pct = 100.0 * added_mass / self._steel_mass_kg
            composition[element] = max(0.0, composition.get(element, 0.0) + delta_pct)
            total_added += added_mass
        return total_added

    def _apply_carbon_oxidation(
        self, composition: Dict[str, float], slag_state: Dict[str, float]
    ) -> float:
        """Decarburization rate tied to FeO activity; returns heat release in kJ."""

        carbon_pct = composition.get("C", 0.0)
        if carbon_pct <= 0.0:
            return 0.0
        feo = slag_state.get("FeO", 15.0)
        driving_factor = max(feo, 1.0) / 20.0
        delta_pct = min(carbon_pct, self._carbon_rate * driving_factor)
        if delta_pct <= 0.0:
            return 0.0
        composition["C"] = carbon_pct - delta_pct
        mass_removed = delta_pct / 100.0 * self._steel_mass_kg
        slag_state["FeO"] = max(0.0, feo - delta_pct * 0.8)
        heat = mass_removed * REACTION_HEAT_KJ_PER_KG.get("C", 0.0)
        return heat

    def _update_temperature(self, mass_added_kg: float, chem_heat_kj: float) -> Tuple[float, Dict[str, float]]:
        """Energy balance: Q_net = Q_arc + Q_chem - Q_loss - Q_cold."""

        current = self._state.temperature_c
        q_arc = self._arc_power_mw * 1000.0 * self._dt_sec * self._arc_efficiency
        q_cold = mass_added_kg * self._alloy_cp_kj * max(current - self._ambient_c, 0.0)
        q_loss, q_conv, q_rad = self._heat_losses(current)
        net_q = q_arc + chem_heat_kj - q_loss - q_cold
        delta_t = net_q / (self._steel_mass_kg * self._bath_cp_kj)
        new_temp = max(1200.0, current + delta_t)
        return new_temp, {
            "q_arc_kj": q_arc,
            "q_chem_kj": chem_heat_kj,
            "q_loss_kj": q_loss,
            "q_conv_kj": q_conv,
            "q_rad_kj": q_rad,
            "q_cold_kj": q_cold,
            "net_q_kj": net_q,
        }

    def _heat_losses(self, temperature_c: float) -> Tuple[float, float, float]:
        delta_t = max(temperature_c - self._ambient_c, 0.0)
        q_conv_kw = self._conv_coeff_kw * self._surface_area_m2 * delta_t
        q_conv_kj = q_conv_kw * self._dt_sec
        temp_k = temperature_c + 273.15
        amb_k = self._ambient_c + 273.15
        rad_w = self._emissivity * SIGMA * self._surface_area_m2 * (temp_k**4 - amb_k**4)
        q_rad_kj = max(0.0, rad_w) * self._dt_sec / 1000.0
        total = max(0.0, q_conv_kj + q_rad_kj)
        return total, q_conv_kj, q_rad_kj

    def _update_slag_state(
        self, action: AlloyAction, slag_state: Dict[str, float]
    ) -> Dict[str, float]:
        slag = dict(slag_state)
        entry = self._alloy_library.get(action.name.lower())
        if entry:
            si_input = action.mass_kg * entry.get("elements", {}).get("Si", 0.0) * 0.12
            mn_input = action.mass_kg * entry.get("elements", {}).get("Mn", 0.0) * 0.05
            slag["SiO2"] = max(0.0, slag.get("SiO2", 12.0) + si_input)
            slag["FeO"] = max(0.0, slag.get("FeO", 18.0) - 0.08 * action.mass_kg - mn_input)
        basicity = self._compute_basicity(slag)
        correction = self._basicity_target - basicity
        slag["CaO"] = max(0.0, slag.get("CaO", 45.0) + 0.5 * correction)
        slag["SiO2"] = max(0.1, slag.get("SiO2", 12.0) - 0.3 * correction)
        return slag

    @staticmethod
    def _compute_basicity(slag_state: Dict[str, float]) -> float:
        return (slag_state.get("CaO", 45.0) + 1e-3) / (slag_state.get("SiO2", 12.0) + 1e-3)

    def _estimate_cost(self, action: AlloyAction) -> float:
        price = self._price_table.get(action.name.lower(), 2500.0)
        return price * action.mass_kg

    def _compose_reward(self) -> float:
        carbon_target = 0.04
        carbon_pct = self._state.composition_pct.get("C", 0.0)
        carbon_penalty = abs(carbon_target - carbon_pct)

        temperature = self._state.temperature_c
        temp_penalty = max(0.0, 1600.0 - temperature) / 150.0

        slag = self._state.slag_state
        basicity = (slag.get("CaO", 45.0) + 1e-3) / (slag.get("SiO2", 12.0) + 1e-3)
        slag_penalty = abs(self._basicity_target - basicity) * 0.2
        feo_penalty = abs(18.0 - slag.get("FeO", 18.0)) / 200.0

        reward = 1.2 - (carbon_penalty + temp_penalty + slag_penalty + feo_penalty)
        return float(np.clip(reward, -2.0, 1.2))

    def _build_alloy_library(self, alloy_catalog: Dict | None) -> Dict[str, Dict]:
        entries: List[Dict] = []
        if alloy_catalog and alloy_catalog.get("catalog"):
            entries = alloy_catalog["catalog"]
        elif self._plant_cfg.get("alloy_catalog"):
            entries = self._plant_cfg["alloy_catalog"]
        library = {entry["name"].lower(): entry for entry in entries}
        if not library:
            return DEFAULT_ALLOY_LIBRARY.copy()
        return library
