import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const LOCAL_API_KEY = "local-dev-key";

export function assertLocalSupabaseUrl(url) {
  let hostname;
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

export function parseStatusValue(stdout, key) {
  for (const line of stdout.trim().split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1 || line.slice(0, eq) !== key) continue;
    let value = line.slice(eq + 1);
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return value;
  }
  throw new Error(`Missing ${key} in supabase status -o env`);
}

export function readSupabaseStatusEnv(rootDir) {
  return execSync("pnpm exec supabase status -o env", {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function readLocalSupabaseEnv(rootDir) {
  const statusEnv = readSupabaseStatusEnv(rootDir);
  const supabaseUrl = parseStatusValue(statusEnv, "API_URL");
  assertLocalSupabaseUrl(supabaseUrl);

  return {
    statusEnv,
    supabaseUrl,
    anonKey: parseStatusValue(statusEnv, "ANON_KEY"),
    serviceRoleKey: parseStatusValue(statusEnv, "SERVICE_ROLE_KEY"),
    databaseUrl: parseStatusValue(statusEnv, "DB_URL"),
    apiKey: LOCAL_API_KEY,
    functionsUrl: `${supabaseUrl.replace(/\/$/, "")}/functions/v1`,
  };
}

export function writeLocalEnvFiles(rootDir, env = readLocalSupabaseEnv(rootDir)) {
  const rootEnvPath = resolve(rootDir, ".env.local");
  const webEnvPath = resolve(rootDir, "web/.env.local");
  const supabaseEnvPath = resolve(rootDir, "supabase/.env");

  writeFileSync(
    rootEnvPath,
    `# Auto-generated — local Supabase Docker stack (not hosted prod).
SUPABASE_PROJECT_REF=local
SUPABASE_URL=${env.supabaseUrl}
SUPABASE_ANON_KEY=${env.anonKey}
SUPABASE_SERVICE_ROLE_KEY=${env.serviceRoleKey}
DATABASE_URL=${env.databaseUrl}
KFZ_API_KEY=${env.apiKey}
`,
  );

  writeFileSync(
    webEnvPath,
    `# Auto-generated — local Supabase Docker stack (not hosted prod).
VITE_FUNCTIONS_URL=${env.functionsUrl}
VITE_KFZ_API_KEY=${env.apiKey}
`,
  );

  writeFileSync(
    supabaseEnvPath,
    `# Auto-generated — local edge function secrets (not hosted prod).
# Loaded by supabase start edge runtime when present.
KFZ_API_KEY=${env.apiKey}
SUPABASE_URL=${env.supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${env.serviceRoleKey}
`,
  );

  writeFileSync(
    resolve(rootDir, ".env.functions.local"),
    `# Auto-generated — passed to supabase functions serve (--env-file).
# CLI skips SUPABASE_* vars; those are injected by the local stack.
KFZ_API_KEY=${env.apiKey}
`,
  );

  return { rootEnvPath, webEnvPath, supabaseEnvPath, functionsEnvPath: resolve(rootDir, ".env.functions.local") };
}
