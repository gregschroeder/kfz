import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "../..");
const kfzListPath = resolve(rootDir, "data/kfz-list.json");

for (const name of [".env.local", ".env"]) {
  const path = resolve(rootDir, name);
  if (existsSync(path)) {
    config({ path });
    break;
  }
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
