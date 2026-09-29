import type { RunRecord } from "@/types/orchestrator";

export function RunHistoryCard({ run }: { run: RunRecord }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-lg shadow-indigo-500/10">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-400">
        <span>{run.id}</span>
        <span>{new Date(run.timestamp).toLocaleString()}</span>
      </div>
      <p className="mt-2 text-sm text-slate-300">Config: {run.configPath}</p>
      <p className="text-xs text-slate-400">Objectives: {run.objectives.join(", ")}</p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        {run.metrics.map((metric) => (
          <div key={metric.label} className="rounded-2xl bg-slate-900/70 p-2 text-center">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {metric.label}
            </p>
            <p className="text-base font-semibold text-white">{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {run.artifacts.map((artifact) => (
          <span
            key={artifact.path}
            className="rounded-full border border-cyan-300/40 px-3 py-1 text-cyan-200"
          >
            {artifact.label}
          </span>
        ))}
      </div>
    </div>
  );
}
