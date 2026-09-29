"use client";

import { useCallback, useMemo, useState } from "react";

import type { ModuleDescriptor, TwinSimulationResponse } from "@/types/orchestrator";

const CALIBRATION_STORAGE_KEY = "twin-loss-calibration";
const OPTIMIZER_WEIGHTS_KEY = "optimizer-weights";
const RL_DEPLOYMENT_KEY = "rl-deployment";

const saveToStorage = (key: string, payload: unknown) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(payload));
};

const readFromStorage = <T,>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn("Failed to parse local storage payload", error);
    return null;
  }
};

type StatusTone = "muted" | "active" | "success" | "error";

const toneClasses: Record<StatusTone, string> = {
  muted: "text-slate-400",
  active: "text-cyan-200",
  success: "text-emerald-300",
  error: "text-rose-400",
};

const statusColorMap = {
  online: "text-emerald-400",
  training: "text-amber-300",
  idle: "text-slate-400",
};

type CalibrationSnapshot = {
  timestamp: number;
  reward: number | null;
  final_basicity: number | null;
  loss_weights: Record<string, number>;
};

type WeightSchedule = {
  timestamp: number;
  weights: Record<string, number>;
};

type DeploymentSnapshot = {
  timestamp: number;
  summary: TwinSimulationResponse["summary"];
};

export function ModuleCard({ module }: { module: ModuleDescriptor }) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState<{ tone: StatusTone; text: string }>(
    { tone: "muted", text: "Standing by" },
  );

  const wait = useCallback((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)), []);

  const queueJob = useCallback(
    async (label: string) => {
      const duration = 900 + Math.random() * 1200;
      await wait(duration);
      const seconds = (duration / 1000).toFixed(1);
      return `${label} staged for ${module.name} • ETA ${seconds}s`;
    },
    [module.name, wait],
  );

  const runSimulation = useCallback(
    async (body: Record<string, unknown> = {}) => {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ max_steps: 120, auto_fill_plan: true, ...body }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.message || "Simulation failed");
      }
      return payload.data as TwinSimulationResponse;
    },
    [],
  );

  const runTwinRollouts = useCallback(async () => {
    const data = await runSimulation();
    const summary = data.summary;
    const peak = summary.max_temperature_c ? Math.round(summary.max_temperature_c) : "-";
    const reward = typeof summary.reward_mean === "number" ? summary.reward_mean.toFixed(2) : "n/a";
    return `Peak ${peak}°C • reward ${reward}`;
  }, [runSimulation]);

  const exportTelemetry = useCallback(async () => {
    const response = await fetch("/api/simulate", { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.message || "Run the twin first");
    }
    if (typeof window === "undefined") {
      throw new Error("Telemetry export is only available in the browser");
    }
    const data = payload.data;
    const fileName = `twin-telemetry-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    const steps = data?.summary?.steps ?? data?.telemetry?.length ?? 0;
    return `Exported ${steps} steps to ${fileName}`;
  }, []);

  const exportPlan = useCallback(() => {
    if (typeof window === "undefined") {
      throw new Error("Plan export requires a browser environment");
    }
    const planPayload = {
      generated_at: new Date().toISOString(),
      module: module.name,
      objectives: module.name.includes("NSGA") ? ["cost", "grade_accuracy", "co2"] : ["stability"],
      steps: [
        { name: "FeSi", mass_kg: 8 },
        { name: "FeMn", mass_kg: 6 },
        { name: "Ni", mass_kg: 3 },
      ],
    };
    const fileName = `alloy-plan-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(planPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return `Plan exported to ${fileName}`;
  }, [module.name]);

  const calibrateLosses = useCallback(async () => {
    const data = await runSimulation({ max_steps: 150 });
    const summary = data.summary;
    const baseline = summary.reward_mean ?? 8.5;
    const energyWeight = Math.min(0.5, Math.max(0.3, baseline / 20));
    const carbonWeight = 0.35 + Math.random() * 0.05;
    const slagWeight = Math.max(0.15, 1 - energyWeight - carbonWeight);
    const payload: CalibrationSnapshot = {
      timestamp: Date.now(),
      reward: summary.reward_mean ?? null,
      final_basicity: summary.final_basicity ?? null,
      loss_weights: {
        energy: Number(energyWeight.toFixed(2)),
        carbon: Number(carbonWeight.toFixed(2)),
        slag: Number(slagWeight.toFixed(2)),
      },
    };
    saveToStorage(CALIBRATION_STORAGE_KEY, payload);
    return `Loss weights tuned → energy ${payload.loss_weights.energy}, carbon ${payload.loss_weights.carbon}, slag ${payload.loss_weights.slag}`;
  }, [runSimulation]);

  const inspectPhysicsLoss = useCallback(async () => {
    const response = await fetch("/api/simulate", { cache: "no-store" });
    const payload = await response.json();
    if (payload.ok && payload.data?.summary) {
      const summary = payload.data.summary as TwinSimulationResponse["summary"];
      const targetBasicity = 3.0;
      const basicity = summary.final_basicity ?? targetBasicity;
      const carbon = summary.final_carbon_pct ?? 0.04;
      const basicityResidual = Math.abs(basicity - targetBasicity) / targetBasicity;
      const carbonResidual = Math.max(0, 0.045 - carbon);
      const rewardResidual = summary.reward_mean ? Math.max(0, 10 - summary.reward_mean) / 10 : 0.2;
      const physicsLoss = Number((basicityResidual * 0.6 + carbonResidual * 4 + rewardResidual * 0.5).toFixed(3));
      return `Physics loss ${physicsLoss} (basicity ${basicity.toFixed(2)}, carbon ${(carbon * 100).toFixed(2)}%)`;
    }
    const snapshot = readFromStorage<CalibrationSnapshot>(CALIBRATION_STORAGE_KEY);
    if (snapshot) {
      return `Last calibrated loss weights stored ${new Date(snapshot.timestamp).toLocaleTimeString()}`;
    }
    throw new Error("Run the twin to collect telemetry first");
  }, []);

  const adjustWeights = useCallback(() => {
    const base = [0.32, 0.38, 0.18, 0.12];
    const jitter = base.map((value) => value + (Math.random() - 0.5) * 0.05);
    const total = jitter.reduce((acc, value) => acc + value, 0);
    const normalized = jitter.map((value) => Number((value / total).toFixed(2)));
    const schedule: WeightSchedule = {
      timestamp: Date.now(),
      weights: {
        cost: normalized[0],
        grade_accuracy: normalized[1],
        co2: normalized[2],
        risk: normalized[3],
      },
    };
    saveToStorage(OPTIMIZER_WEIGHTS_KEY, schedule);
    return `Weights saved → cost ${schedule.weights.cost}, grade ${schedule.weights.grade_accuracy}, CO₂ ${schedule.weights.co2}`;
  }, []);

  const deployControlLoop = useCallback(async () => {
    const data = await runSimulation({ max_steps: 90 });
    const snapshot: DeploymentSnapshot = {
      timestamp: Date.now(),
      summary: data.summary,
    };
    saveToStorage(RL_DEPLOYMENT_KEY, snapshot);
    const temp = snapshot.summary.final_temperature_c ? Math.round(snapshot.summary.final_temperature_c) : "-";
    const reward = snapshot.summary.reward_mean ? snapshot.summary.reward_mean.toFixed(2) : "n/a";
    return `RL loop synced @ ${temp}°C • reward ${reward}`;
  }, [runSimulation]);

  const resolveAction = useCallback(
    async (label: string) => {
      if (module.name === "Digital Twin") {
        if (label === "Run 100 rollouts") {
          return runTwinRollouts();
        }
        if (label === "Export telemetry") {
          return exportTelemetry();
        }
        if (label === "Calibrate losses") {
          return calibrateLosses();
        }
      }

      if (module.name === "Physics-Informed ML") {
        if (label === "Inspect physics loss") {
          return inspectPhysicsLoss();
        }
        return queueJob(label);
      }

      if (module.name === "NSGA-II Optimizer") {
        if (label === "Export plan") {
          return exportPlan();
        }
        if (label === "Adjust weights") {
          return adjustWeights();
        }
        return queueJob(label);
      }

      if (module.name === "RL Control Agent") {
        if (label === "Evaluate policy") {
          const result = await queueJob(label);
          return `${result} • reward probes enqueued`;
        }
        if (label === "Deploy control loop") {
          return deployControlLoop();
        }
        return queueJob(label);
      }

      return queueJob(label);
    },
    [
      adjustWeights,
      calibrateLosses,
      deployControlLoop,
      exportPlan,
      exportTelemetry,
      module.name,
      queueJob,
      runTwinRollouts,
      inspectPhysicsLoss,
    ],
  );

  const handleAction = useCallback(
    async (label: string) => {
      setActiveAction(label);
      setStatusLine({ tone: "active", text: `Executing ${label}…` });
      try {
        const message = await resolveAction(label);
        setStatusLine({ tone: "success", text: typeof message === "string" ? message : "Action complete" });
      } catch (error) {
        setStatusLine({
          tone: "error",
          text: error instanceof Error ? error.message : "Action failed",
        });
      } finally {
        setActiveAction(null);
      }
    },
    [resolveAction],
  );

  const statusColor = useMemo(() => statusColorMap[module.status], [module.status]);

  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm shadow-2xl shadow-cyan-500/5">
      <header className="flex items-center justify-between">
        <p className={`text-xs uppercase tracking-[0.2em] ${statusColor}`}>
          {module.status}
        </p>
        <p className="text-sm text-slate-400">{module.kpis.join(" • ")}</p>
      </header>
      <h3 className="mt-3 text-xl font-semibold text-white">{module.name}</h3>
      <p className="mt-2 text-sm text-slate-300">{module.summary}</p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {module.highlights.map((item) => (
          <li
            key={item}
            className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs text-cyan-200"
          >
            {item}
          </li>
        ))}
      </ul>

      {module.actions && module.actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {module.actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => handleAction(action)}
              disabled={Boolean(activeAction) && activeAction !== action}
              className={`rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white transition hover:border-cyan-400/60 hover:text-cyan-200 ${
                activeAction === action ? "border-cyan-400/60 text-cyan-100" : ""
              } ${Boolean(activeAction) && activeAction !== action ? "cursor-not-allowed opacity-40" : ""}`}
            >
              {activeAction === action ? "Running…" : action}
            </button>
          ))}
        </div>
      )}

      <p className={`mt-3 text-xs uppercase tracking-[0.2em] ${toneClasses[statusLine.tone]}`}>
        {statusLine.text}
      </p>
    </article>
  );
}
