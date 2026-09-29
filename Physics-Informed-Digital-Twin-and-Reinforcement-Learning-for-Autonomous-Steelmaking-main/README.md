# Ultra-Advanced AI Steelmaking Control System

An integrated research-grade platform that couples a high-fidelity digital twin, physics-informed predictive models, multi-objective optimization, and reinforcement learning to deliver closed-loop autonomous alloying decisions for electric arc and basic oxygen steelmaking routes.

## System Flow

1. **Digital Twin Simulator** reproduces slag-metal reactions, heat losses, and composition drift to provide a controllable, stochastic training environment.
2. **Physics-Informed Predictive Model (PIML)** blends metallurgical constraints with a PyTorch PINN surrogate to forecast compositions and properties.
3. **Multi-Objective Optimizer (NSGA-II / Bayesian)** recommends alloy addition strategies that balance cost, emissions, and quality.
4. **Reinforcement Learning Control Agent** runs a PyTorch PPO actor-critic that adapts real-time alloying actions to process disturbances using the twin as an environment.
5. **Global Orchestrator** sequences modules, enforces plant constraints, and surfaces operator guidance via dashboards or APIs.

## Repository Layout

```
├── config/                    # YAML/JSON configuration profiles per plant grade
├── data/
│   ├── raw/                   # Incoming sensor, lab, and historian exports
│   └── processed/             # Feature-engineered datasets for modeling
├── docs/                      # Architecture notes, specs, and research references
├── experiments/               # Tracking notebooks, runs, and RL checkpoints
├── scripts/                   # Automation for training/evaluation
├── src/
│   ├── common/                # Shared dataclasses, utilities, logging
│   ├── digital_twin/          # Stochastic thermochemical simulator
│   ├── piml/                  # Physics-informed predictive modeling code
│   ├── optimizer/             # NSGA-II / Bayesian optimizers and constraints
│   ├── rl_agent/              # RL environment wrapper and policy learners
│   └── orchestrator/          # Closed-loop controller wiring all modules
└── main.py                    # CLI entry point that runs orchestration workflows
```

## Technology Stack

- **Language:** Python 3.11+
- **Core Libraries (default):** `numpy`, `torch`, `pydantic`, `pyyaml`, `rich`.
- **Optional Research Add-ons:** enable `pytorch-lightning`, `gymnasium`, `mlflow`, `optuna`, etc., when targeting GPU training or large-scale experiments.
- **Visualization:** `plotly`, `bokeh`, `matplotlib` (add as needed for diagnostics).

Install the lightweight defaults via `pip install -r requirements.txt`, then layer additional dependencies per your experimentation plan.

## Quick Start

1. **Clone & Environment:** Create a Python 3.11 virtual environment and install dependencies.
2. **Configure Plant Scenario:** Duplicate `config/default.yaml`, edit furnace specs, target grade, and optimization weights.
3. **Generate Synthetic Data:** Run `python scripts/bootstrap_data.py --config config/default.yaml` to populate `data/processed/` with simulation traces.
4. **Train PIML:** `python scripts/train_piml.py --config config/default.yaml` to produce surrogate checkpoints in `experiments/`.
5. **Optimize Alloy Plan:** `python scripts/run_optimizer.py --config config/default.yaml` to emit alloy recommendations.
6. **Train RL Agent:** `python scripts/train_rl.py --config config/default.yaml` to produce policies stored under `experiments/rl/`.
7. **Evaluate RL Policy:** `python scripts/evaluate_policy.py --config config/default.yaml --checkpoint experiments/rl/policy.pt` to benchmark the saved PPO policy (use `--stochastic` to sample actions).
8. **Export RL Policy (optional):** `python scripts/export_policy.py --config config/default.yaml --checkpoint experiments/rl/policy.pt --output exports/policy.ts --format torchscript` to serialize the actor for deployment (switch format to `onnx` as needed).
9. **Launch Twin Simulation API:** `uvicorn api.simulation_api:app --reload --port 8000` (run from the repo root) to expose `/twin/run` and `/twin/state` endpoints for visualization.
10. **Visualize the Twin:** `cd frontend && SIM_API_URL=http://127.0.0.1:8000 npm run dev`, then open `http://localhost:3000/dashboard/simulator` to edit alloy plans and stream telemetry from the FastAPI service.
11. **Launch Orchestrator:** `python main.py orchestrate --config config/default.yaml` to run the full closed-loop controller using the latest artifacts.

> Each script accepts a `--config` flag so you can switch between grade families and furnace setups without editing code.

## Interactive Twin Visualization

- The FastAPI service at `api/simulation_api.py` exposes `/twin/run` (POST) to execute a batch of alloy actions on the upgraded physics twin and streams step-by-step telemetry (temperature, basicity, rewards, energy terms). `/twin/state` returns the latest run for dashboards.
- The Next.js route `/api/simulate` proxies requests to that service so the UI can run entirely within the existing frontend dev server. Configure the backend URL via `SIM_API_URL` (defaults to `http://127.0.0.1:8000`).
- Navigate to `/dashboard/simulator` in the frontend to edit alloy plans, trigger runs, and visualize temperature/reward curves, composition trajectories, and slag basicity/FeO trends in Recharts-powered plots tailored for mechanical audiences.

## Operator Interface (Next.js)

An optional cockpit lives in [frontend/](frontend/README.md). It displays module KPIs, timelines, run history, and triggers the orchestrator through a Next.js API route.

1. `cd frontend && npm install`
2. (Optional) create `frontend/.env.local` with `PYTHON_BIN="../.venv/Scripts/python.exe"` (or the POSIX equivalent).
3. `npm run dev` and open `http://localhost:3000/dashboard`

> The built-in `/api/orchestrate` endpoint spawns the Python CLI directly and therefore targets on-prem or local demos. Swap it for a FastAPI/REST endpoint before deploying to serverless hosting.

## Validation & Testing

- Follow the acceptance criteria in [docs/validation.md](docs/validation.md) for twin calibration, surrogate accuracy, optimizer diversity, and RL robustness.
- Keep `experiments/` under version control using metadata only (use `.gitkeep` and store heavy artifacts elsewhere).
- Record MLflow runs for PIML/optimizer modules and Weights & Biases sweeps for RL to maintain auditability.

## Research Roadmap

- Validate the digital twin against plant historian data (heat-by-heat comparisons).
- Enrich PIML with thermodynamic priors (phase diagrams, mass balance) through custom loss terms.
- Compare NSGA-II, Bayesian, and evolutionary strategies for alloy recommendations under carbon tax scenarios.
- Benchmark off-policy RL (CQL, IQL) versus on-policy PPO/SAC for robustness against unseen scrap mixes.
- Deploy orchestrator outputs to a lightweight FastAPI service for operator decision support.

## Contributing

1. Create a feature branch.
2. Add/Update unit tests (see docs/architecture.md for module-specific guidelines).
3. Ensure formatters (`ruff`, `black`) and linters pass.
4. Open a PR summarizing datasets used, metrics, and validation plots.

This repository is intentionally modular—feel free to swap subcomponents (different optimizers, RL algorithms, or surrogate models) while keeping the high-level interfaces stable.
