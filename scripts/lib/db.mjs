import pg from "pg";
import { getDatabaseUrl } from "./load-env.mjs";

const { Pool } = pg;

let pool;

function isLocalDatabaseUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export function getPool() {
  if (!pool) {
    const connectionString = getDatabaseUrl();
    pool = new Pool({
      connectionString,
      ssl: isLocalDatabaseUrl(connectionString)
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function queryDb(text, params = []) {
  const result = await getPool().query(text, params);
  return result;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
