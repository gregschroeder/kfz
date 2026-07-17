import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertLocalDevOnly,
  assertProdOnly,
} from "./guard-local-only.mjs";

const rootDir = resolve(import.meta.dirname, "../..");
const kfzListPath = resolve(rootDir, "data/kfz-list.json");

const ENV_FILES = {
  local: ".env.local",
  prod: ".env",
};

export function loadEnvTarget(target) {
  const name = ENV_FILES[target];
  if (!name) {
    throw new Error(`Invalid env target "${target}" — use "local" or "prod"`);
  }

  const path = resolve(rootDir, name);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${name} for ${target} target.` +
        (target === "local"
          ? " Run: pnpm env:local"
          : " Copy .env.example to .env and fill in prod values."),
    );
  }

  config({ path, override: true, quiet: true });
  return path;
}

/** Call at the start of scripts — requires KFZ_ENV=local|prod from package.json. */
export function initEnvForScript() {
  const target = process.env.KFZ_ENV;
  if (target !== "local" && target !== "prod") {
    throw new Error(
      'KFZ_ENV must be "local" or "prod". Use the matching pnpm script (e.g. data:local:seed, data:prod:seed).',
    );
  }

  const path = loadEnvTarget(target);
  if (target === "local") {
    assertLocalDevOnly();
  } else {
    assertProdOnly();
  }

  console.error(`→ ${target} database (${path})`);
  return { target, path };
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const password = requireEnv("SUPABASE_DB_PASSWORD");
  const ref = process.env.SUPABASE_PROJECT_REF ?? "wchzccrcqlxgsftjbpgn";
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`;
}

export { rootDir, kfzListPath };
