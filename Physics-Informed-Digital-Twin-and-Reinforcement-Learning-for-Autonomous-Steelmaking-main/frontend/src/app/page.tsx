import Link from "next/link";
import { MetricCard } from "@/components/metric-card";
import { ModuleCard } from "@/components/module-card";
import { metricCards, moduleCards } from "@/lib/constants";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 lg:py-24">
      <section className="rounded-[32px] border border-white/15 bg-white/5 p-10 backdrop-blur-md shadow-[0_20px_120px_rgba(14,165,233,0.25)]">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-200">Ultra-Advanced Steelmaking</p>
        <div className="mt-6 grid gap-8 lg:grid-cols-[2fr_1fr]">
          <div>
            <h1 className="text-4xl font-semibold leading-tight text-white lg:text-5xl">
              Digital Twin + PIML + NSGA-II + RL in a single autonomous control cockpit.
            </h1>
            <p className="mt-4 text-lg text-slate-300">
              Monitor module health, launch orchestrations, and review Pareto-optimal alloy plans from a single UI tailored to AI-powered steel plants.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm">
              <Link
                className="rounded-full bg-cyan-400/90 px-6 py-3 font-semibold text-slate-900 shadow-xl shadow-cyan-400/40"
                href="/dashboard"
              >
                Open Operations Dashboard
              </Link>
              <Link
                className="rounded-full border border-emerald-300/50 px-6 py-3 text-emerald-100"
                href="/dashboard/simulator"
              >
                Visualize Digital Twin
              </Link>
              <Link
                className="rounded-full border border-white/30 px-6 py-3 text-slate-100"
                href="/docs"
              >
                Architecture Docs
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {metricCards.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Cortex</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">End-to-end intelligence stack</h2>
          </div>
          <Link href="/dashboard" className="text-sm text-cyan-300 underline-offset-4 hover:underline">
            View live status
          </Link>
        </header>
        <div className="grid gap-6 md:grid-cols-2">
          {moduleCards.map((module) => (
            <ModuleCard key={module.name} module={module} />
          ))}
        </div>
      </section>
    </main>
  );
}
