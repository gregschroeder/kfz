#!/usr/bin/env node
/** Write .env.local, web/.env.local, and supabase/.env from local Supabase status. */
import { resolve } from "node:path";
import { writeLocalEnvFiles } from "./lib/local-env.mjs";

const rootDir = resolve(import.meta.dirname, "..");

try {
  const paths = writeLocalEnvFiles(rootDir);
  console.log(`Wrote ${paths.rootEnvPath}`);
  console.log(`Wrote ${paths.webEnvPath}`);
  console.log(`Wrote ${paths.supabaseEnvPath}`);
  console.log(`Wrote ${paths.functionsEnvPath}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  console.error("Start local Supabase with: pnpm db:local:start");
  process.exit(1);
}
