import { spawn, type ChildProcess } from "node:child_process";
import { testLog } from "./verbose";

let functionsProc: ChildProcess | null = null;

export async function ensureFunctionsServe(rootDir: string, functionsUrl: string) {
  const healthUrl = `${functionsUrl.replace(/\/$/, "")}/kfz-queue`;
  if (await isFunctionsHealthy(healthUrl)) {
    testLog("[functions] Edge runtime already serving");
    return;
  }

  testLog("[functions] Starting supabase functions serve…");
  functionsProc = spawn(
    "pnpm",
    ["exec", "supabase", "functions", "serve", "--env-file", ".env.functions.local"],
    {
      cwd: rootDir,
      stdio: "ignore",
      detached: true,
    },
  );
  functionsProc.unref();

  await waitForFunctions(healthUrl);
}

export async function stopFunctionsServe() {
  if (!functionsProc?.pid) return;
  try {
    process.kill(-functionsProc.pid, "SIGTERM");
  } catch {
    try {
      process.kill(functionsProc.pid, "SIGTERM");
    } catch {
      // already stopped
    }
  }
  functionsProc = null;
}

async function isFunctionsHealthy(healthUrl: string): Promise<boolean> {
  try {
    const res = await fetch(healthUrl, {
      headers: { "x-kfz-key": "local-dev-key" },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function waitForFunctions(healthUrl: string, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isFunctionsHealthy(healthUrl)) {
      testLog("[functions] Edge runtime ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for edge functions at ${healthUrl}. Run: pnpm functions:local:deploy`,
  );
}
