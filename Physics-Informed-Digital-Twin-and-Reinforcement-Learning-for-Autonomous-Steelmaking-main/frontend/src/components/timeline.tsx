import type { TimelineEvent } from "@/types/orchestrator";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="space-y-4">
      {events.map((event, index) => (
        <li key={event.id} className="flex items-start gap-4">
          <span className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xs font-semibold text-cyan-300">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{event.label}</p>
            <p className="text-xs text-slate-300">{event.detail}</p>
            <p className="text-xs text-slate-500">{event.eta}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
