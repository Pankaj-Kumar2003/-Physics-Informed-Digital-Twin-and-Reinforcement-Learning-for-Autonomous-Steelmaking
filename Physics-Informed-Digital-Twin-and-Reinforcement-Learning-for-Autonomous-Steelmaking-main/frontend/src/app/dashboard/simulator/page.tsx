"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { demoTwinPlan } from "@/lib/constants";
import type {
  TwinAction,
  TwinSimulationResponse,
  TwinSimulationSummary,
  TwinTelemetryPoint,
} from "@/types/orchestrator";

const alloyOptions = ["FeSi", "FeMn", "Ni", "Mo", "FeCr"];

export default function TwinSimulatorPage() {
  const [configPath, setConfigPath] = useState("config/default.yaml");
  const [plan, setPlan] = useState<TwinAction[]>(demoTwinPlan);
  const [telemetry, setTelemetry] = useState<TwinTelemetryPoint[]>([]);
  const [summary, setSummary] = useState<TwinSimulationSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config_path: configPath, plan }),
      });
      const payload = (await response.json()) as { ok: boolean; data?: TwinSimulationResponse; message?: string };
      if (!payload.ok || !payload.data) {
        throw new Error(payload.message || "Simulation failed");
      }
      setTelemetry(payload.data.telemetry);
      setSummary(payload.data.summary);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : String(issue));
    } finally {
      setLoading(false);
    }
  }

  function updatePlan(index: number, field: keyof TwinAction, value: string) {
    setPlan((prev) => {
      const copy = [...prev];
      if (field === "mass_kg") {
        copy[index] = { ...copy[index], mass_kg: Number(value) };
      } else {
        copy[index] = { ...copy[index], name: value };
      }
      return copy;
    });
  }

  function addStep() {
    setPlan((prev) => [...prev, { name: "FeSi", mass_kg: 4 }]);
  }

  function removeStep(index: number) {
    setPlan((prev) => prev.filter((_, idx) => idx !== index));
  }

  const chartData = useMemo(
    () =>
      telemetry.map((point) => ({
        step: point.step,
        temperature: point.temperature_c,
        carbon: point.composition.C ?? point.carbon_pct ?? 0,
        manganese: point.composition.Mn ?? 0,
        silicon: point.composition.Si ?? 0,
        basicity: point.basicity ?? 0,
        feo: point.feo_pct ?? 0,
        reward: point.reward ?? 0,
      })),
    [telemetry],
  );

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="rounded-[32px] border border-white/10 bg-gradient-to-r from-emerald-500/20 via-cyan-500/15 to-indigo-500/20 p-8 shadow-[0_30px_120px_rgba(16,185,129,0.15)]">
        <p className="text-xs uppercase tracking-[0.4em] text-emerald-100">Digital twin laboratory</p>
        <h1 className="mt-4 text-4xl font-semibold text-white">Interactive furnace simulation</h1>
        <p className="mt-3 max-w-3xl text-slate-200">
          Compose alloy plans, run the upgraded physics-backed twin, and visualize temperature, chemistry, and slag trajectories in real time.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Scenario setup</p>
          <h2 className="mt-2 text-xl font-semibold">Alloy plan</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-slate-300">
              Config file
              <input
                value={configPath}
                onChange={(event) => setConfigPath(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900/60 p-3 text-white"
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-slate-900/40">
              <div className="grid grid-cols-[1fr_120px_40px] border-b border-white/5 p-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                <span>Alloy</span>
                <span className="text-center">Mass (kg)</span>
                <span />
              </div>
              {plan.map((action, index) => (
                <div key={`${action.name}-${index}`} className="grid grid-cols-[1fr_120px_40px] items-center gap-3 border-b border-white/5 p-3 last:border-b-0">
                  <select
                    value={action.name}
                    onChange={(event) => updatePlan(index, "name", event.target.value)}
                    className="rounded-2xl border border-white/10 bg-slate-900/60 p-2 text-sm"
                  >
                    {alloyOptions.map((option) => (
                      <option key={option} value={option} className="bg-slate-900">
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={action.mass_kg}
                    onChange={(event) => updatePlan(index, "mass_kg", event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-2 text-center text-sm"
                  />
                  <button
                    className="text-slate-400 transition hover:text-rose-300"
                    onClick={() => removeStep(index)}
                    aria-label="Remove step"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={addStep}
                className="flex-1 rounded-2xl border border-emerald-400/60 px-4 py-3 text-sm font-semibold text-emerald-200"
              >
                Add step
              </button>
              <button
                onClick={runSimulation}
                disabled={loading}
                className="flex-1 rounded-2xl bg-emerald-400/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Running..." : "Run digital twin"}
              </button>
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Summary</p>
          <h2 className="mt-2 text-xl font-semibold">Thermochemistry snapshot</h2>
          {summary ? (
            <dl className="mt-4 grid gap-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Final temperature</dt>
                <dd className="text-white">{summary.final_temperature_c?.toFixed(1)} °C</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Carbon (%C)</dt>
                <dd className="text-white">{summary.final_carbon_pct?.toFixed(3)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Slag basicity</dt>
                <dd className="text-white">{summary.final_basicity?.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Max temperature</dt>
                <dd className="text-white">{summary.max_temperature_c?.toFixed(1)} °C</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Mean reward</dt>
                <dd className="text-white">{summary.reward_mean?.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Steps executed</dt>
                <dd className="text-white">{summary.steps}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-sm text-slate-400">Run a simulation to populate telemetry.</p>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Thermal regime</p>
            <h2 className="mt-2 text-xl font-semibold">Temperature & reward</h2>
          </div>
        </div>
        <div className="mt-4 h-72">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ left: 12, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="step" stroke="#94a3b8" />
              <YAxis yAxisId="temp" stroke="#f8fafc" label={{ value: "°C", angle: -90, position: "insideLeft" }} />
              <YAxis yAxisId="reward" orientation="right" stroke="#34d399" />
              <Tooltip contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Legend />
              <Line type="monotone" yAxisId="temp" dataKey="temperature" stroke="#fbbf24" strokeWidth={2} dot={false} name="Temperature (°C)" />
              <Line type="monotone" yAxisId="reward" dataKey="reward" stroke="#34d399" strokeWidth={2} dot={false} name="Reward" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Chemistry</p>
          <h2 className="mt-2 text-xl font-semibold">Composition trajectories</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <LineChart data={chartData} margin={{ left: 12, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="step" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" label={{ value: "%", angle: -90, position: "insideLeft" }} />
                <Tooltip contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(255,255,255,0.1)" }} />
                <Legend />
                <Line type="monotone" dataKey="carbon" stroke="#f472b6" dot={false} name="Carbon" />
                <Line type="monotone" dataKey="manganese" stroke="#38bdf8" dot={false} name="Manganese" />
                <Line type="monotone" dataKey="silicon" stroke="#f97316" dot={false} name="Silicon" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-200">Slag dynamics</p>
          <h2 className="mt-2 text-xl font-semibold">Basicity & FeO</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ left: 12, right: 24 }}>
                <defs>
                  <linearGradient id="basicity" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="feo" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="step" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: "#020617", border: "1px solid rgba(255,255,255,0.1)" }} />
                <Legend />
                <Area type="monotone" dataKey="basicity" stroke="#22d3ee" fill="url(#basicity)" name="Basicity" />
                <Area type="monotone" dataKey="feo" stroke="#f87171" fill="url(#feo)" name="FeO (%)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </main>
  );
}
