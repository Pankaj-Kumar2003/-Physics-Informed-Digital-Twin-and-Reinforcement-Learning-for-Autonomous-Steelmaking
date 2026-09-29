import type { MetricDescriptor } from "@/types/orchestrator";

const trendStyles = {
  up: "text-emerald-400",
  down: "text-rose-400",
  flat: "text-slate-300",
};

export function MetricCard({ metric }: { metric: MetricDescriptor }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-sm text-slate-400">{metric.label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{metric.value}</p>
      <p className={`text-xs uppercase tracking-wide ${trendStyles[metric.trend]} mt-1`}>
        {metric.delta}
      </p>
    </div>
  );
}
