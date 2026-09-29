import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export type PythonExecutionPlan = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  printable: string;
};

export function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT) {
    return path.resolve(process.env.REPO_ROOT);
  }

  if (process.env.INIT_CWD) {
    return path.resolve(process.env.INIT_CWD, "..");
  }

  let current = path.resolve(process.cwd());
  const fsRoot = path.parse(current).root;
  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return path.resolve(current, "..");
    }
    if (current === fsRoot) {
      throw new Error("Unable to resolve repository root. Set REPO_ROOT to override.");
    }
    current = path.dirname(current);
  }
}

function buildPythonEnv(repoRoot: string): NodeJS.ProcessEnv {
  const srcPath = path.join(repoRoot, "src");
  const existing = process.env.PYTHONPATH || "";
  const joined = existing ? `${srcPath}${path.delimiter}${existing}` : srcPath;
  return {
    ...process.env,
    PYTHONPATH: joined,
  };
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function toWslPath(winPath: string): string {
  if (winPath[1] !== ":") {
    return winPath.replace(/\\/g, "/");
  }
  const drive = winPath[0].toLowerCase();
  const rest = winPath.slice(2).replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

export function resolvePythonPlan(repoRoot: string, scriptArgs: string[]): PythonExecutionPlan {
  const wslPython = path.join(repoRoot, ".venv-wsl", "bin", "python");
  const hasWslPython = existsSync(wslPython);

  if (process.platform === "win32" && hasWslPython) {
    const wslRepo = toWslPath(repoRoot);
    const wslSrc = `${wslRepo}/src`;
    const wslPythonPath = `${wslRepo}/.venv-wsl/bin/python`;
    const escapedArgs = scriptArgs.map((arg) => escapeShellArg(arg)).join(" ");
    const commandString = [
      `cd ${escapeShellArg(wslRepo)}`,
      `export PYTHONPATH=${escapeShellArg(wslSrc)}:$PYTHONPATH`,
      `${escapeShellArg(wslPythonPath)} ${escapedArgs}`,
    ].join(" && ");

    return {
      command: "wsl",
      args: ["bash", "-lc", commandString],
      env: process.env,
      printable: `wsl bash -lc ${commandString}`,
    };
  }

  const pythonBin = (() => {
    const forced = process.env.PYTHON_BIN;
    if (forced && existsSync(forced)) {
      return forced;
    }

    const relativeCandidates = [
      [".venv-wsl", "bin", "python"],
      [".venv-wsl", "Scripts", "python.exe"],
      [".venv", "Scripts", "python.exe"],
      [".venv", "bin", "python"],
      ["venv", "Scripts", "python.exe"],
      ["venv", "bin", "python"],
    ];

    for (const segments of relativeCandidates) {
      const candidate = path.join(repoRoot, ...segments);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return process.platform === "win32" ? "python" : "python3";
  })();

  return {
    command: pythonBin,
    args: scriptArgs,
    env: buildPythonEnv(repoRoot),
    printable: `${pythonBin} ${scriptArgs.join(" ")}`,
  };
}

export function runCommand(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(cmd, args, { cwd, env }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
