import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { execTestShell, testLog } from "./verbose";

export function assertLocalSupabaseUrl(url: string) {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid Supabase URL: ${url}`);
  }
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(
      `Refusing non-local Supabase (${url}). Use the local Docker stack only.`,
    );
  }
}

export function ensureLocalSupabaseRunning(rootDir: string, label = "test") {
  try {
    execSync("pnpm exec supabase status", {
      cwd: rootDir,
      stdio: "ignore",
    });
  } catch {
    testLog(`[${label}] Starting local Supabase…`);
    try {
      execTestShell("pnpm exec supabase start", { cwd: rootDir });
    } catch {
      throw new Error(
        "Could not start local Supabase. Ensure Docker is running, then run: pnpm db:local:start",
      );
    }
  }
}

export function writeLocalEnvFiles(rootDir: string) {
  execTestShell("node scripts/write-local-env.mjs", { cwd: rootDir });
}

export function readWebEnvLocal(rootDir: string): Record<string, string> {
  const envPath = path.join(rootDir, "web", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}. Run: pnpm dev or node scripts/write-local-env.mjs`);
  }

  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return vars;
}

function dbContainer(rootDir: string): string {
  const projectId = fs
    .readFileSync(path.join(rootDir, "supabase/config.toml"), "utf8")
    .match(/^project_id = "([^"]+)"/m)?.[1];
  if (!projectId) {
    throw new Error("Could not read project_id from supabase/config.toml");
  }
  return `supabase_db_${projectId}`;
}

export function applySqlFile(rootDir: string, relativePath: string, allowReset = false) {
  const file = path.join(rootDir, relativePath);
  const container = dbContainer(rootDir);

  if (allowReset) {
    execTestShell(
      `{ echo "SET app.kfz_allow_reset = 'true';"; cat "${file}"; } | docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`,
      { cwd: rootDir },
    );
  } else {
    execTestShell(
      `docker exec -i ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "${file}"`,
      { cwd: rootDir },
    );
  }

  testLog(`Applied ${relativePath}`);
}
