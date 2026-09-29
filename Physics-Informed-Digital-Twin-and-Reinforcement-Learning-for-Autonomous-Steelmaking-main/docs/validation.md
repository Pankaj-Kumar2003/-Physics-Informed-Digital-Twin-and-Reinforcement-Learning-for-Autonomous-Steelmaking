# Validation & Experiment Plan

## Offline Validation

1. **Digital Twin Fit**
   - Compare twin predictions with historical heats using MAPE for carbon, manganese, and temperature.
   - Use paired t-tests to verify no significant drift (>2%) for each key element.

2. **PIML Surrogate**
   - Train/validation/test split of 70/15/15.
   - Track MAPE, MAE, and physics-penalty across splits; fail run if penalty > 0.05.
   - Perform SHAP or feature-importance analyses for interpretability.

3. **Optimizer**
   - Evaluate Pareto fronts using hypervolume and spacing metrics.
   - Stress-test with cost shocks (+/-30%) and carbon tax scenarios.

4. **RL Agent**
   - Run 100 evaluation rollouts using unseen random seeds.
   - Report grade hit rate, cumulative cost, constraint violations.
   - Apply adversarial perturbations (scrap chemistry, late temperature drops).

## Online / Digital Twin-In-Loop Validation

- Deploy orchestrator against the calibrated twin in near real-time.
- Enable `--record-metrics` flag to log: grade deviation, alloy cost, CO₂ estimate, controller latency.
- Trigger scenario suite:
  - Sudden cold scrap batch (temperature -80 °C).
  - High phosphorus scrap (P +0.02%).
  - Power flicker causing 5-minute delay.

## Acceptance Criteria

- Grade deviation (per element) < ±0.02 wt% in 95% of heats.
- Alloy cost savings ≥ 4% versus baseline manual plan.
- RL actions never violate temperature floor (1580 °C) in evaluation runs.
- Optimization stage produces at least 5 diverse Pareto solutions per run.

## Tooling

- Use `mlflow` experiments for PIML/optimizer metrics.
- Track RL runs via `wandb` sweeps (`scripts/train_rl.py --wandb`).
- Store scenario manifests under `experiments/scenarios/` for repeatability.
