"use client";

import { useCallback, useMemo, useState } from "react";

import type { RLDemoPayload, TwinTelemetryPoint } from "@/types/orchestrator";

interface Props {
  configPath: string;
  policyPath: string;
  onPolicyPathChange?: (path: string) => void;
  policyUpdatedAt?: number | null;
}

type RunStatus = "idle" | "running" | "done" | "error";

const statusCopy: Record<RunStatus, string> = {
  idle: "Standing by",
  running: "Streaming actions from RL agent",
  done: "Episode captured",
  error: "Run failed",
};

export function RlShowcase({ configPath, policyPath, onPolicyPathChange, policyUpdatedAt }: Props) {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [logLines, setLogLines] = useState<string[]>([]);
  const [payload, setPayload] = useState<RLDemoPayload | null>(null);
  const derivedSeed = useMemo(() => {
    let hash = 0;
    for (let index = 0; index < configPath.length; index += 1) {
      hash = (hash * 31 + configPath.charCodeAt(index)) >>> 0;
    }
    return (hash % 100000) + 1;
  }, [configPath]);

  const hasValue = (value: number | null | undefined): value is number =>
    value !== null && value !== undefined && !Number.isNaN(value);

  const formatNumber = useCallback((value: number | null | undefined, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "n/a";
    }
    return value.toFixed(digits);
  }, []);

  const runDemo = useCallback(async () => {
    setStatus("running");
    setLogLines([`RL agent engaging twin for ${configPath}`]);
    try {
      const body: Record<string, unknown> = {
        configPath,
        deterministic: true,
        episodes: 1,
        seed: derivedSeed,
        warmupEpisodes: 12,
        forceWarmup: true,
      };
      if (policyPath) {
        body.policyPath = policyPath;
      }
      const response = await fetch("/api/rl-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payloadBody = await response.json();
      if (!response.ok || payloadBody.ok === false) {
        throw new Error(payloadBody.message || "RL demo failed");
      }
      const data = payloadBody.data as RLDemoPayload | undefined;
      if (!data || data.ok === false) {
        throw new Error("RL demo returned no telemetry");
      }
      setPayload(data);
      setLogLines((prev) => [
        ...prev,
        ...(Array.isArray(payloadBody.log) ? payloadBody.log : []),
        payloadBody.stderr ? `stderr: ${payloadBody.stderr}` : undefined,
      ].filter(Boolean) as string[]);
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setLogLines((prev) => [...prev, error instanceof Error ? error.message : String(error)]);
    }
  }, [configPath, derivedSeed, policyPath]);

  const summary = payload?.summary;
  const planPreview = payload?.plan ?? [];
  const telemetry: TwinTelemetryPoint[] = payload?.telemetry ?? [];
  const trimmedTelemetry = useMemo(() => telemetry.slice(1, 9), [telemetry]);
  const events = payload?.events ?? [];

  const peakTemperature = summary?.max_temperature_c;
  const finalCarbonPct = summary?.final_carbon_pct;
  const totalReward = summary?.total_reward;

  const formattedPeak = hasValue(peakTemperature) ? `${Math.round(peakTemperature)} degC` : "--";
  const formattedCarbon = hasValue(finalCarbonPct)
    ? `${formatNumber((finalCarbonPct as number) * 100, 2)} %`
    : "--";
  const formattedReward = hasValue(totalReward) ? formatNumber(totalReward, 2) : "n/a";

  const summaryCards = [
    { label: "Peak temp", value: formattedPeak },
    { label: "Final carbon", value: formattedCarbon },
    { label: "Total reward", value: formattedReward },
    { label: "Steps", value: summary?.steps ?? "--" },
  ];

  const aggLabel = payload
    ? `${formatNumber(payload.aggregate.mean_reward, 2)} ± ${formatNumber(payload.aggregate.std_reward, 2)}`
    : "n/a";

  return (
    <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-cyan-900/30 p-6 shadow-2xl shadow-cyan-500/10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">RL demonstration</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Policy-in-the-loop twin run</h2>
          <p className="text-sm text-slate-300">Active config: {configPath}</p>
          {payload && (
            <>
              <p className="text-xs text-slate-400">
                Policy source: <span className="text-cyan-200">{payload.policy_source}</span> ({aggLabel}) · seed {payload.seed}
              </p>
              {payload.warmup && (
                <p className="text-xs text-slate-500">
                  Warmup mean reward {formatNumber((payload.warmup.mean_reward as number) ?? 0, 2)}
                </p>
              )}
            </>
          )}
          {policyUpdatedAt && (
            <p className="text-xs text-slate-500">
              Last training sync: {new Date(policyUpdatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="text-xs text-slate-400">
            Policy checkpoint
            <input
              type="text"
              value={policyPath}
              onChange={(event) => onPolicyPathChange?.(event.target.value)}
              placeholder="experiments/rl/policy.pt"
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 p-2 text-white"
            />
          </label>
          <button
            type="button"
            onClick={runDemo}
            disabled={status === "running" || !policyPath}
            className="rounded-2xl bg-cyan-400/90 px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "running" ? "Streaming episode..." : "Run RL control"}
          </button>
        </div>
      </header>

      <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-400">{statusCopy[status]}</p>
      {!policyPath && (
        <p className="text-xs text-rose-300">Provide a policy checkpoint path to deploy the freshly trained agent.</p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Action stream</p>
          <h3 className="mt-2 text-lg font-semibold text-white">First 8 decisions</h3>
          <ol className="mt-4 space-y-3 text-sm text-slate-200">
            {trimmedTelemetry.length ? (
              trimmedTelemetry.map((point) => (
                <li
                  key={point.step}
                  className="rounded-xl border border-white/10 bg-black/30 p-3"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
                    <span>Step {point.step}</span>
                    <span>{point.action?.name ?? "n/a"}</span>
                  </div>
                  <p className="mt-1 text-base font-semibold text-white">
                    {Math.round(point.temperature_c)} degC · reward {formatNumber(point.reward, 2)}
                  </p>
                  <p className="text-xs text-slate-400">
                    Carbon {formatNumber(point.carbon_pct * 100, 2)} % · Basicity {hasValue(point.basicity) ? formatNumber(point.basicity, 2) : "n/a"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Commanded {formatNumber(point.action?.mass_kg ?? null, 1)} kg · Realized {hasValue(point.mass_added_kg) ? formatNumber(point.mass_added_kg, 1) : "n/a"} kg
                  </p>
                  {point.reward_breakdown && (
                    <p className="text-xs text-slate-500">
                      Δgrade {formatNumber(point.reward_breakdown.grade_hit, 2)} • cost {formatNumber(point.reward_breakdown.alloy_cost, 2)} • temp {formatNumber(point.reward_breakdown.temperature_penalty, 2)}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <li className="text-xs text-slate-500">Run the demo to see live telemetry.</li>
            )}
          </ol>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Console</p>
          <h3 className="mt-2 text-lg font-semibold text-white">Agent log</h3>
          <div className="mt-3 h-52 overflow-y-auto rounded-xl bg-black/30 p-3 font-mono text-xs text-cyan-100">
            {logLines.length ? logLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>) : <p className="text-slate-500">No log entries yet.</p>}
          </div>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Plan preview</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-200">
              {planPreview.length ? (
                planPreview.slice(0, 5).map((action, index) => (
                  <li key={`${action.name}-${index}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-slate-400">#{index + 1}</span>
                    <span className="font-semibold text-white">{action.name}</span>
                    <span className="text-slate-300">{formatNumber(action.mass_kg, 1)} kg</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-slate-500">Trigger the RL run to capture a plan.</li>
              )}
            </ul>
          </div>
        </div>
      </div>

      {events.length > 0 && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Event tape</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {events.slice(0, 6).map((event) => (
              <div key={event.step} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Step {event.step}</p>
                <p className="mt-1 text-white">{event.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
