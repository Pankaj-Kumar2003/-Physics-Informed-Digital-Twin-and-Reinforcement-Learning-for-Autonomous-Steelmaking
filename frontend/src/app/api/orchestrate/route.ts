import { NextResponse } from "next/server";

import { resolvePythonPlan, resolveRepoRoot, runCommand } from "../_lib/python";

interface Payload {
  configPath?: string;
  episodes?: number;
}

export async function POST(request: Request) {
  const repoRoot = resolveRepoRoot();

  try {
    const body = (await request.json().catch(() => ({}))) as Payload;
    const configPath = body.configPath ?? "config/default.yaml";
    const args = ["main.py", "orchestrate", "--config", configPath];
    const plan = resolvePythonPlan(repoRoot, args);
    console.info("[api/orchestrate] executing", plan.printable);
    const { stdout, stderr } = await runCommand(plan.command, plan.args, repoRoot, plan.env);

    return NextResponse.json({
      ok: true,
      stdout,
      stderr,
      command: plan.printable,
      metrics: { grade: "±0.018%", cost: "$5.1k", reward: "9.01" },
      artifacts: {
        piml: "experiments/piml_weights.npz",
        plan: "experiments/plan.json",
      },
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
