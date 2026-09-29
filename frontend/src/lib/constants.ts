import type {
  MetricDescriptor,
  ModuleDescriptor,
  PipelineStageDescriptor,
  RunRecord,
  TimelineEvent,
  TwinAction,
} from "@/types/orchestrator";

export const moduleCards: ModuleDescriptor[] = [
  {
    name: "Digital Twin",
    summary:
      "Stochastic thermochemical sandbox mirroring slag-metal reactions and energy drift.",
    status: "online",
    highlights: ["500 rollouts/hr", "Gym-compatible API"],
    kpis: ["±1.8% heat fidelity", "<120 ms step"],
    actions: ["Run 100 rollouts", "Export telemetry", "Calibrate losses"],
  },
  {
    name: "Physics-Informed ML",
    summary:
      "Surrogate models enforcing mass balance and phase envelopes for rapid forecasting.",
    status: "training",
    highlights: ["Hybrid loss", "Symmetry-aware features"],
    kpis: ["MAPE 0.6%", "Physics loss 0.1"],
    actions: ["Refresh PINN", "Validate dataset", "Inspect physics loss"],
  },
  {
    name: "NSGA-II Optimizer",
    summary:
      "Multi-objective alloy planner balancing grade accuracy, cost, emissions, and risk.",
    status: "online",
    highlights: ["Pareto frontier", "Configurable objectives"],
    kpis: ["4.3% cost↓", "CO₂ -6%"],
    actions: ["Recompute Pareto", "Adjust weights", "Export plan"],
  },
  {
    name: "RL Control Agent",
    summary:
      "Sequential policy reacting to scrap, slag, and tap temperature disturbances in real time.",
    status: "idle",
    highlights: ["PPO core", "Reward shaping"],
    kpis: ["Mean R 9.0", "<2% violations"],
    actions: ["Warm-start training", "Evaluate policy", "Deploy control loop"],
  },
];

export const metricCards: MetricDescriptor[] = [
  { label: "Grade Hit", value: "97.8%", delta: "+1.2%", trend: "up" },
  { label: "Alloy Cost", value: "$-42k", delta: "-4.1%", trend: "down" },
  { label: "CO₂ Intensity", value: "1.82 t/t", delta: "-0.08", trend: "down" },
  { label: "Cycle Time", value: "46 min", delta: "-3", trend: "flat" },
];

export const timeline: TimelineEvent[] = [
  {
    id: "twin",
    label: "Digital Twin Rollouts",
    detail: "Sampling 500 heats with stochastic scrap mixes",
    eta: "~2 min"
  },
  {
    id: "piml",
    label: "Physics-Informed Training",
    detail: "Fitting surrogate with mass-balance priors",
    eta: "~4 min"
  },
  {
    id: "optimizer",
    label: "NSGA-II Pareto Search",
    detail: "Evaluating 128 alloy strategies",
    eta: "~3 min"
  },
  {
    id: "rl",
    label: "RL Policy Refresh",
    detail: "PPO episodes on calibrated twin",
    eta: "~8 min"
  },
];

export const pipelineStages: PipelineStageDescriptor[] = [
  {
    id: "twin",
    title: "Digital Twin",
    summary: "Generate stochastic rollouts to seed the learning stack.",
    actionLabel: "Bootstrap rollouts",
    eta: "~2 min",
  },
  {
    id: "piml",
    title: "Train PINN",
    summary: "Fit physics-informed surrogate models on fresh trajectories.",
    actionLabel: "Train surrogate",
    eta: "~4 min",
  },
  {
    id: "nsga",
    title: "Optimize with NSGA-II",
    summary: "Recompute Pareto-efficient alloy plans with updated priors.",
    actionLabel: "Run optimizer",
    eta: "~3 min",
  },
  {
    id: "rl",
    title: "Train RL Agent",
    summary: "Fine-tune the PPO controller against the calibrated twin.",
    actionLabel: "Train policy",
    eta: "~8 min",
  },
];

export const mockRuns: RunRecord[] = [
  {
    id: "HX-4827",
    timestamp: "2025-12-19T10:42:00Z",
    configPath: "config/default.yaml",
    objectives: ["cost", "grade_accuracy", "co2"],
    metrics: [
      { label: "Grade Δ", value: "±0.018%" },
      { label: "Cost Saved", value: "$5.1k" },
      { label: "Reward", value: "9.01" },
    ],
    artifacts: [
      { label: "PIML", path: "experiments/piml_weights.npz" },
      { label: "Plan", path: "experiments/plan.json" },
    ],
  },
  {
    id: "HX-4826",
    timestamp: "2025-12-18T22:15:00Z",
    configPath: "config/inconel.yaml",
    objectives: ["cost", "risk"],
    metrics: [
      { label: "Grade Δ", value: "±0.024%" },
      { label: "Cost Saved", value: "$3.8k" },
      { label: "Reward", value: "8.54" },
    ],
    artifacts: [
      { label: "PIML", path: "experiments/piml_inconel.pt" },
      { label: "Policy", path: "experiments/rl/policy.pt" },
    ],
  },
];

export const demoTwinPlan: TwinAction[] = [
  { name: "FeSi", mass_kg: 8 },
  { name: "FeMn", mass_kg: 6 },
  { name: "Ni", mass_kg: 3 },
  { name: "FeSi", mass_kg: 4 },
];
