export type ModuleStatus = "online" | "training" | "idle";

export interface ModuleDescriptor {
  name: string;
  summary: string;
  status: ModuleStatus;
  highlights: string[];
  kpis: string[];
  actions?: string[];
}

export type PipelineStageId = "twin" | "piml" | "nsga" | "rl";

export interface PipelineStageDescriptor {
  id: PipelineStageId;
  title: string;
  summary: string;
  actionLabel: string;
  eta: string;
}

export interface MetricDescriptor {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
}

export interface RunRecord {
  id: string;
  timestamp: string;
  configPath: string;
  objectives: string[];
  metrics: { label: string; value: string }[];
  artifacts: { label: string; path: string }[];
}

export interface TimelineEvent {
  id: string;
  label: string;
  detail: string;
  eta: string;
}

export interface TwinAction {
  name: string;
  mass_kg: number;
  injection_route?: string;
}

export interface TwinTelemetryPoint {
  step: number;
  temperature_c: number;
  composition: Record<string, number>;
  slag: Record<string, number>;
  basicity: number | null;
  reward: number | null;
  energy: Record<string, number>;
  carbon_pct: number;
  feo_pct: number;
  action?: TwinAction | null;
  reward_breakdown?: RewardBreakdown;
  done?: boolean;
  mass_added_kg?: number | null;
}

export interface TwinSimulationSummary {
  max_temperature_c: number | null;
  min_temperature_c: number | null;
  final_temperature_c: number | null;
  final_carbon_pct: number | null;
  final_basicity: number | null;
  reward_mean: number | null;
  total_reward?: number | null;
  steps: number;
}

export interface TwinSimulationResponse {
  config_path: string;
  plan: TwinAction[];
  telemetry: TwinTelemetryPoint[];
  summary: TwinSimulationSummary;
}

export interface RewardBreakdown {
  grade_hit: number;
  alloy_cost: number;
  temperature_penalty: number;
  emission_penalty: number;
}

export interface RLDemoEvent {
  step: number;
  description: string;
}

export interface RLDemoPayload extends TwinSimulationResponse {
  ok: boolean;
  policy_source: string;
  deterministic: boolean;
  aggregate: {
    episodes: number;
    mean_reward: number;
    std_reward: number;
    reward_trace: number[];
  };
  events: RLDemoEvent[];
  episode_index: number;
  seed: number;
  warmup?: Record<string, unknown> | null;
}
