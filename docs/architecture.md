# System Architecture

## Layered Stack

1. **Digital Twin Layer**
   - Implements a configurable thermochemical simulator capturing slag-metal equilibrium, energy balance, and scrap variability.
   - Provides Gym-style `reset()` and `step()` APIs for RL training and dataset synthesis.

2. **Physics-Informed Modeling Layer**
   - Converts twin or plant historian traces into supervised datasets.
   - Uses neural surrogates with physics priors (mass balance, phase boundaries) enforced via custom penalties and soft constraints.

3. **Optimization Layer**
   - Consumes PIML forecasts plus scenario constraints to generate Pareto-optimal alloy plans via NSGA-II or Bayesian search.
   - Encodes objectives for cost, grade accuracy, emissions, and risk.

4. **Reinforcement Learning Layer**
   - Wraps the twin as an environment with partial observability and process noise.
   - The in-repo PPO actor-critic (PyTorch) supports batched twin rollouts and TorchScript/ONNX export for deployment; other algorithms (SAC, CQL) can be swapped in later.

5. **Orchestration & UI Layer**
   - Stitches modules into end-to-end workflows, tracks artifacts, and exposes APIs or dashboards for operator support.
   - FastAPI simulation service (`/twin/run`, `/twin/state`) streams high-resolution telemetry to the Next.js dashboard, enabling the `/dashboard/simulator` view to visualize temperature, composition, and slag dynamics plan-by-plan.

## Data & Control Flow

```
Historians ─┐                 ┌───> Multi-Objective Optimizer ──┐
            ├─> Feature Lab ──┤                               │
Twin Rollouts┘                 └─> PIML Surrogate ─────────┐  │
                                                         │  │
Operator Goals ───────────────────────────────────────────┼──┘
                                                         │
Digital Twin <── RL Agent <── Orchestrator ──> Operator UI/API
```

- The twin generates datasets when historian coverage is sparse.
- PIML outputs feed both the optimizer (static plan) and RL agent (reward shaping, look-ahead).
- RL agent interacts with the twin for training, then executes on-line with planner recommendations as priors.

## Training & Evaluation Plan

| Stage | Inputs | Outputs | Key Metrics |
|-------|--------|---------|-------------|
| Twin Calibration | Lab samples, thermodynamic tables | Tuned twin parameters | % deviation vs. real heats |
| PIML Training | Twin/historian rollouts | Surrogate checkpoint | MAPE per element, physics loss |
| Optimization | PIML forecasts, economic constraints | Pareto plans | Cost vs. deviation trade-off |
| RL Training | Twin env, reward weights | Policy weights | Mean episode reward, constraint violations |
| Closed-Loop Validation | Twin-in-loop scenarios | Operator dashboards | Grade hit rate, CO₂ intensity |

## Deployment Considerations

- Package orchestrator as a FastAPI service; expose `/optimize` and `/control` endpoints.
- Stream live sensor data via OPC-UA/Kafka to keep the RL state vector fresh.
- Schedule nightly PIML/optimizer refresh using Airflow or Prefect.

## Testing Strategy

- **Unit Tests:** Mock twin outputs to validate optimizer scoring and RL reward decomposition.
- **Integration Tests:** Run short orchestrations with deterministic seeds to ensure module compatibility.
- **Stress Tests:** Randomize scrap chemistry edges to confirm controller stability.

## Future Upgrades

- Introduce CFD-backed heat transfer models via OpenFOAM coupling.
- Replace PIML backbone with graph neural networks encoding ladle subregions.
- Extend optimizer with constraint handling for BOF slopping risk.
- Deploy distributed training on Ray for RL to shorten experimentation cycles.
