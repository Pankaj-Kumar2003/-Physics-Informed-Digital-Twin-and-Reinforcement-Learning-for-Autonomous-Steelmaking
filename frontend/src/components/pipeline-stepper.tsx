"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { pipelineStages } from "@/lib/constants";
import type { PipelineStageDescriptor, PipelineStageId } from "@/types/orchestrator";

const stepStatuses = {
  idle: { label: "Idle", tone: "text-slate-400" },
  running: { label: "Running", tone: "text-amber-300" },
  completed: { label: "Completed", tone: "text-emerald-300" },
  error: { label: "Error", tone: "text-rose-400" },
};

type StageStatus = keyof typeof stepStatuses;

type StageState = {
  status: StageStatus;
  log: string[];
};

interface PipelineStepperProps {
  configPath: string;
  initialRlEpisodes: number;
  onPolicyReady?: (policyPath: string) => void;
}

const buildInitialState = (): Record<PipelineStageId, StageState> => {
  return pipelineStages.reduce((acc, stage) => {
    acc[stage.id] = { status: "idle", log: [] };
    return acc;
  }, {} as Record<PipelineStageId, StageState>);
};

export function PipelineStepper({
  configPath,
  initialRlEpisodes,
  onPolicyReady,
}: PipelineStepperProps) {
  const [stageStates, setStageStates] = useState<Record<PipelineStageId, StageState>>(
    () => buildInitialState(),
  );
  const [activeStage, setActiveStage] = useState<PipelineStageId | null>(null);
  const [twinEpisodes, setTwinEpisodes] = useState(80);
  const [pimlEpochs, setPimlEpochs] = useState(25);
  const [rlEpisodes, setRlEpisodes] = useState(initialRlEpisodes);

  useEffect(() => {
    setRlEpisodes(initialRlEpisodes);
  }, [initialRlEpisodes]);

  useEffect(() => {
    setStageStates(buildInitialState());
    setActiveStage(null);
  }, [configPath]);

  const orderedStages = useMemo(() => pipelineStages as PipelineStageDescriptor[], []);

  const canRunStage = useCallback(
    (stageId: PipelineStageId) => {
      const stageIndex = orderedStages.findIndex((stage) => stage.id === stageId);
      if (stageIndex <= 0) {
        return true;
      }
      return orderedStages
        .slice(0, stageIndex)
        .every((stage) => stageStates[stage.id].status === "completed");
    },
    [orderedStages, stageStates],
  );

  const updateStageState = useCallback((stageId: PipelineStageId, update: Partial<StageState>) => {
    setStageStates((prev) => ({
      ...prev,
      [stageId]: {
        ...prev[stageId],
        ...update,
        log: update.log ?? prev[stageId].log,
      },
    }));
  }, []);

  const payloadForStage = useCallback(
    (stageId: PipelineStageId) => {
      const payload: Record<string, unknown> = {
        stage: stageId,
        configPath,
      };
      if (stageId === "twin") {
        payload.episodes = twinEpisodes;
      }
      if (stageId === "piml") {
        payload.epochs = pimlEpochs;
      }
      if (stageId === "rl") {
        payload.episodes = rlEpisodes;
      }
      return payload;
    },
    [configPath, pimlEpochs, rlEpisodes, twinEpisodes],
  );

  const runStage = useCallback(
    async (stageId: PipelineStageId) => {
      setActiveStage(stageId);
      updateStageState(stageId, { status: "running", log: ["Dispatching stage"] });
      try {
        const response = await fetch("/api/pipeline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadForStage(stageId)),
        });
        const data = await response.json();
        if (!response.ok || data.ok === false) {
          throw new Error(data.message || "Stage failed");
        }
        const logLines = Array.isArray(data.log)
          ? data.log
          : data.stdout
            ? String(data.stdout).split(/\r?\n/)
            : ["Stage completed"];
        const artifacts = (data.artifacts ?? null) as Record<string, string> | null;
        if (stageId === "rl" && artifacts?.policy) {
          logLines.push(`Policy saved to ${artifacts.policy}`);
          onPolicyReady?.(artifacts.policy);
        }
        updateStageState(stageId, {
          status: "completed",
          log: logLines.filter(Boolean),
        });
      } catch (error) {
        updateStageState(stageId, {
          status: "error",
          log: [error instanceof Error ? error.message : "Stage failed"],
        });
      } finally {
        setActiveStage(null);
      }
    },
    [payloadForStage, updateStageState, onPolicyReady],
  );

  const resetPipeline = useCallback(() => {
    setStageStates(buildInitialState());
    setActiveStage(null);
  }, []);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl shadow-cyan-500/10">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">Guided training</p>
          <h2 className="text-xl font-semibold text-white">Step-by-step pipeline</h2>
          <p className="text-sm text-slate-300">Config {configPath}</p>
        </div>
        <button
          type="button"
          onClick={resetPipeline}
          className="self-start rounded-full border border-white/20 px-4 py-1.5 text-xs text-slate-300"
        >
          Reset stages
        </button>
      </header>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {orderedStages.map((stage) => {
          const stageState = stageStates[stage.id];
          const statusMeta = stepStatuses[stageState.status];
          const disabled =
            activeStage !== null && activeStage !== stage.id;
          const gated = !canRunStage(stage.id);
          return (
            <article
              key={stage.id}
              className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"
            >
              <header className="flex items-center justify-between text-xs uppercase tracking-[0.3em]">
                <span className="text-slate-400">{stage.title}</span>
                <span className={statusMeta.tone}>{statusMeta.label}</span>
              </header>
              <p className="mt-2 text-sm text-slate-200">{stage.summary}</p>
              <p className="text-xs text-slate-500">{stage.eta}</p>
              {stage.id === "twin" && (
                <label className="mt-3 block text-xs text-slate-400">
                  Rollout episodes
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={twinEpisodes}
                    onChange={(event) => setTwinEpisodes(Number(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 p-2 text-white"
                  />
                </label>
              )}
              {stage.id === "piml" && (
                <label className="mt-3 block text-xs text-slate-400">
                  Training epochs
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={pimlEpochs}
                    onChange={(event) => setPimlEpochs(Number(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 p-2 text-white"
                  />
                </label>
              )}
              {stage.id === "rl" && (
                <label className="mt-3 block text-xs text-slate-400">
                  RL episodes
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={rlEpisodes}
                    onChange={(event) => setRlEpisodes(Number(event.target.value))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 p-2 text-white"
                  />
                </label>
              )}
              <button
                type="button"
                disabled={disabled || gated || stageState.status === "running"}
                onClick={() => runStage(stage.id)}
                className={`mt-3 w-full rounded-full px-4 py-2 text-sm font-semibold text-slate-900 transition ${
                  disabled || gated
                    ? "cursor-not-allowed bg-slate-600/40 text-slate-400"
                    : "bg-cyan-400/90 hover:bg-cyan-300"
                }`}
              >
                {stageState.status === "running" ? "Running..." : stage.actionLabel}
              </button>
              <div className="mt-3 h-24 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-2 text-[11px] text-cyan-100">
                {stageState.log.length ? (
                  stageState.log.slice(-4).map((line, index) => <p key={`${stage.id}-${index}`}>{line}</p>)
                ) : (
                  <p className="text-slate-500">Awaiting execution</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
