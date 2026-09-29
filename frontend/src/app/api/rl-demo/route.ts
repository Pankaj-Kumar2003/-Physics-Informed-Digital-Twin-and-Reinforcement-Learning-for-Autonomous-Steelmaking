import { NextResponse } from "next/server";

import { resolvePythonPlan, resolveRepoRoot, runCommand } from "../_lib/python";

interface Payload {
  configPath?: string;
  episodes?: number;
  deterministic?: boolean;
  policyPath?: string;
  seed?: number;
  warmupEpisodes?: number;
  forceWarmup?: boolean;
}

export async function POST(request: Request) {
  const repoRoot = resolveRepoRoot();
  let stdoutBuffer = "";
  let stderrBuffer = "";

  try {
    const body = (await request.json().catch(() => ({}))) as Payload;
    const configPath = body.configPath ?? "config/default.yaml";
    const episodes = Math.max(1, Number(body.episodes ?? 1));
    const args = [
      "scripts/run_rl_demo.py",
      "--config",
      configPath,
      "--episodes",
      String(episodes),
    ];
    if (typeof body.seed === "number") {
      args.push("--seed", String(body.seed));
    }
    if (typeof body.warmupEpisodes === "number") {
      args.push("--warmup-episodes", String(body.warmupEpisodes));
    }
    if (body.forceWarmup ?? true) {
      args.push("--force-warmup");
    }
    if (body.policyPath) {
      args.push("--policy", body.policyPath);
    }
    if (body.deterministic) {
      args.push("--deterministic");
    }

    const plan = resolvePythonPlan(repoRoot, args);
    console.info("[api/rl-demo] executing", plan.printable);
    const { stdout, stderr } = await runCommand(plan.command, plan.args, repoRoot, plan.env);
    stdoutBuffer = stdout;
    stderrBuffer = stderr;

    const trimmed = stdout.trim();
    if (!trimmed) {
      throw new Error("RL demo produced no output");
    }

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch (parseError) {
      throw new Error(`Failed to parse RL demo output: ${(parseError as Error).message}`);
    }

    if (typeof data !== "object" || data === null) {
      throw new Error("RL demo returned an unexpected payload");
    }

    const events = Array.isArray((data as Record<string, unknown>).events)
      ? ((data as Record<string, unknown>).events as Array<Record<string, unknown>>)
      : [];

    return NextResponse.json({
      ok: true,
      data,
      stderr: stderrBuffer,
      command: plan.printable,
      log: events
        .map((event) => event.description)
        .filter((value): value is string => typeof value === "string"),
    });
  } catch (rawIssue) {
    if (rawIssue && typeof rawIssue === "object" && "error" in rawIssue) {
      const issue = rawIssue as { error: Error; stdout: string; stderr: string };
      stdoutBuffer = stdoutBuffer || issue.stdout;
      stderrBuffer = stderrBuffer || issue.stderr;
      return NextResponse.json(
        {
          ok: false,
          message: issue.error.message,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
        },
        { status: 500 },
      );
    }

    const message = rawIssue instanceof Error ? rawIssue.message : "RL demo failed";
    return NextResponse.json(
      {
        ok: false,
        message,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
      },
      { status: 500 },
    );
  }
}
