import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { afterAll, beforeAll } from "vitest";
import { ensureFunctionsServe, stopFunctionsServe } from "../helpers/functions-serve";
import {
  applySqlFile,
  ensureLocalSupabaseRunning,
  readWebEnvLocal,
  writeLocalEnvFiles,
} from "../helpers/supabase-local";
import { execTestShell, isTestVerbose, testLog } from "../helpers/verbose";

const rootDir = path.resolve(import.meta.dirname, "../..");

function loadWebEnvLocal() {
  loadDotenv({
    path: path.join(rootDir, "web", ".env.local"),
    override: true,
    quiet: !isTestVerbose(),
  });
  const vars = readWebEnvLocal(rootDir);
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value;
  }
  return vars;
}

beforeAll(async () => {
  ensureLocalSupabaseRunning(rootDir, "integration");
  writeLocalEnvFiles(rootDir);
  const vars = loadWebEnvLocal();

  if (process.env.INTEGRATION_SKIP_DB_RESET !== "1") {
    testLog("[integration] Restoring fixture data…");
    execTestShell("bash scripts/restore-local-fixtures.sh", { cwd: rootDir });
    applySqlFile(rootDir, "test/fixtures/seed-minimal.sql");
  } else {
    testLog("[integration] INTEGRATION_SKIP_DB_RESET=1 — skipping fixture restore");
  }

  await ensureFunctionsServe(rootDir, vars.VITE_FUNCTIONS_URL);
}, 120_000);

afterAll(async () => {
  await stopFunctionsServe();
});
