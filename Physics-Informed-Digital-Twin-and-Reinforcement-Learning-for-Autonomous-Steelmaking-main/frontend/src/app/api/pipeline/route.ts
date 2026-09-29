import { NextResponse } from "next/server";

import { resolvePythonPlan, resolveRepoRoot, runCommand } from "../_lib/python";

type PipelineStage = "twin" | "piml" | "nsga" | "rl";

interface PipelinePayload {
  stage: PipelineStage;
  configPath?: string;
  episodes?: number;
  epochs?: number;
}

type StageConfig = {
  script: string;
  args: (payload: PipelinePayload, configPath: string) => string[];
};

const STAGE_CONFIG: Record<PipelineStage, StageConfig> = {
  twin: {
    script: "scripts/bootstrap_data.py",
    args: (payload, configPath) => [
      "--config",
      configPath,
      "--episodes",
      String(payload.episodes ?? 64),
    ],
  },
  piml: {
    script: "scripts/train_piml.py",
    args: (payload, configPath) => [
      "--config",
      configPath,
      "--epochs",
      String(payload.epochs ?? 25),
    ],
  },
  nsga: {
    script: "scripts/run_optimizer.py",
    args: (_payload, configPath) => ["--config", configPath],
  },
  rl: {
    script: "scripts/train_rl.py",
    args: (payload, configPath) => [
      "--config",
      configPath,
      "--episodes",
      String(payload.episodes ?? 20),
    ],
  },
};

export async function POST(request: Request) {
  const repoRoot = resolveRepoRoot();

  try {
    const body = (await request.json().catch(() => ({}))) as PipelinePayload;
    const stage = body.stage;
    if (!stage || !(stage in STAGE_CONFIG)) {
      return NextResponse.json(
        { ok: false, message: "Unknown pipeline stage" },
        { status: 400 },
      );
    }

    const configPath = body.configPath ?? "config/default.yaml";
    const stageConfig = STAGE_CONFIG[stage];
    const stageArgs = [stageConfig.script, ...stageConfig.args(body, configPath)];
    const plan = resolvePythonPlan(repoRoot, stageArgs);
    console.info(`[api/pipeline] stage=${stage} executing ${plan.printable}`);
    const { stdout, stderr } = await runCommand(plan.command, plan.args, repoRoot, plan.env);

    const artifacts = (() => {
      if (stage === "rl") {
        return { policy: "experiments/rl/policy.pt" };
      }
      if (stage === "piml") {
        return { piml: "experiments/piml_weights.npz" };
      }
      if (stage === "nsga") {
        return { plan: "experiments/plan.json" };
      }
      return undefined;
    })();

    return NextResponse.json({
      ok: true,
      stage,
      stdout,
      stderr,
      command: plan.printable,
      artifacts,
      log: stdout.split(/\r?\n/).filter(Boolean),
    });
  } catch (issue) {
    const { error, stdout, stderr } = issue as {
      error: Error;
      stdout: string;
      stderr: string;
    };
    return NextResponse.json(
      {
        ok: false,
        message: error.message,
        stdout,
        stderr,
        log: [error.message, stderr].filter(Boolean),
      },
      { status: 500 },
    );
  }
}
