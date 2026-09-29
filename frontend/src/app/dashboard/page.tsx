"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MetricCard } from "@/components/metric-card";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { RunHistoryCard } from "@/components/run-history-card";
import { Timeline } from "@/components/timeline";
import { RlShowcase } from "@/components/rl-showcase";
import { metricCards, mockRuns, moduleCards, timeline } from "@/lib/constants";
import type { RunRecord } from "@/types/orchestrator";

const scenarioPresets = [
  { label: "Baseline Stainless", config: "config/default.yaml" },
  { label: "Low-Carbon Coil", config: "config/low_carbon.yaml" },
  { label: "Duplex Grades", config: "config/duplex.yaml" },
];

export default function Dashboard() {
  const [configPath, setConfigPath] = useState(scenarioPresets[0].config);
  const [episodes, setEpisodes] = useState(10);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">(
    "idle",
  );
  const [consoleLog, setConsoleLog] = useState<string[]>([]);
  const [history, setHistory] = useState<RunRecord[]>(mockRuns);
  const [policyPath, setPolicyPath] = useState("experiments/rl/policy.pt");
  const [policyUpdatedAt, setPolicyUpdatedAt] = useState<number | null>(null);

  const statusLabel = {
    idle: "Idle",
    running: "Dispatching modules",
    completed: "Artifacts ready",
    error: "Run failed",
  }[status];

  async function triggerRun() {
    setStatus("running");
    setConsoleLog([
      `Launching orchestrator → ${configPath}`,
      `RL episodes requested: ${episodes}`,
    ]);

    try {
      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configPath, episodes }),
      });
      const payload = await response.json();
      setConsoleLog((prev) => {
        const combined = [
          ...prev,
          ...(Array.isArray(payload.log)
            ? payload.log
            : payload.stdout
              ? String(payload.stdout).split("\n")
              : []),
          payload.stderr ? `stderr: ${payload.stderr}` : undefined,
        ].filter(Boolean) as string[];
        return combined;
      });

      if (!response.ok || payload.ok === false) {
        setStatus("error");
        return;
      }

      const newRecord: RunRecord = {
        id: `HX-${Date.now().toString().slice(-4)}`,
        timestamp: new Date().toISOString(),
        configPath,
        objectives: ["cost", "grade_accuracy", "co2"],
        metrics: [
          { label: "Grade Δ", value: payload.metrics?.grade ?? "±0.02%" },
          { label: "Cost Saved", value: payload.metrics?.cost ?? "$4.8k" },
          { label: "Reward", value: payload.metrics?.reward ?? "9.0" },
        ],
        artifacts: [
          { label: "PIML", path: payload.artifacts?.piml ?? "experiments/piml_weights.npz" },
          { label: "Plan", path: payload.artifacts?.plan ?? "experiments/plan.json" },
        ],
      };
      setHistory((prev) => [newRecord, ...prev]);
      setStatus("completed");
    } catch (error) {
      setConsoleLog((prev) => [...prev, String(error)]);
      setStatus("error");
    }
  }

  const moduleStatus = useMemo(() => moduleCards, []);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="rounded-[32px] border border-white/10 bg-gradient-to-r from-cyan-500/20 via-sky-500/10 to-indigo-500/20 p-8 shadow-[0_30px_120px_rgba(14,165,233,0.15)]">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-100">Operations dashboard</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Closed-loop controller console</h1>
        <p className="mt-3 max-w-3xl text-slate-200">
          Configure scenarios, trigger orchestrations, and review artifacts from the AI steelmaking stack without leaving the browser.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link
            href="/dashboard/simulator"
            className="rounded-full border border-emerald-300/40 px-5 py-2 text-emerald-100"
          >
            Open digital twin lab
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Scenario</p>
          <h2 className="mt-2 text-xl font-semibold">Configuration</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm text-slate-300">
              Config file
              <select
                value={configPath}
                onChange={(event) => setConfigPath(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-white"
              >
                {scenarioPresets.map((preset) => (
                  <option key={preset.config} value={preset.config} className="bg-slate-900">
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              RL Episodes
              <input
                type="number"
                min={5}
                max={200}
                value={episodes}
                onChange={(event) => setEpisodes(Number(event.target.value))}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-white"
              />
            </label>
            <button
              onClick={triggerRun}
              disabled={status === "running"}
              className="w-full rounded-2xl bg-cyan-400/90 px-6 py-3 font-semibold text-slate-900 shadow-lg shadow-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "running" ? "Running orchestrator..." : "Run orchestrator"}
            </button>
            <p className="text-xs text-slate-400">
              Status: <span className="text-cyan-200">{statusLabel}</span>
            </p>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Console</p>
          <h2 className="mt-2 text-xl font-semibold">Latest log</h2>
          <div className="mt-4 h-64 overflow-y-auto rounded-2xl bg-black/40 p-4 font-mono text-xs text-cyan-100">
            {consoleLog.length ? (
              consoleLog.map((line, index) => <p key={index}>{line}</p>)
            ) : (
              <p className="text-slate-500">No runs yet—trigger the orchestrator to stream logs.</p>
            )}
          </div>
        </div>
      </section>

      <PipelineStepper
        configPath={configPath}
        initialRlEpisodes={episodes}
        onPolicyReady={(path) => {
          setPolicyPath(path);
          setPolicyUpdatedAt(Date.now());
        }}
      />

      <RlShowcase
        configPath={configPath}
        policyPath={policyPath}
        onPolicyPathChange={setPolicyPath}
        policyUpdatedAt={policyUpdatedAt}
      />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/5 p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Telemetry</p>
              <h2 className="mt-2 text-xl font-semibold">Module KPIs</h2>
            </div>
          </header>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {metricCards.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Timeline</p>
          <h2 className="mt-2 text-xl font-semibold">Pipeline stages</h2>
          <div className="mt-4">
            <Timeline events={timeline} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Module status</p>
          <h2 className="mt-2 text-xl font-semibold">Digital twin → RL</h2>
          <div className="mt-4 grid gap-4">
            {moduleStatus.map((module) => (
              <div key={module.name} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
                  <span>{module.name}</span>
                  <span>{module.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-200">{module.summary}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-200">
                  {module.highlights.map((item) => (
                    <span key={item} className="rounded-full border border-cyan-300/30 px-3 py-1">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Run history</p>
          <h2 className="mt-2 text-xl font-semibold">Latest artifacts</h2>
          <div className="mt-4 space-y-4">
            {history.map((run) => (
              <RunHistoryCard key={run.id + run.timestamp} run={run} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
