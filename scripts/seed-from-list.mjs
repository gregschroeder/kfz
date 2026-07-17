#!/usr/bin/env node
/**
 * Sync prefix list from data/kfz-list.json into kfz.prefixes.
 *
 * Always add or update — never delete. Prefixes that drop off the official
 * list may still appear on plates in the wild; existing DB rows are kept.
 *
 * Never sets queried_at (only lookup_and_increment does, on successful lookup).
 *
 * Usage:
 *   pnpm data:seed
 *   pnpm data:seed:counts
 *   node scripts/seed-from-list.mjs --counts path/to/stats.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, getPool } from "./lib/db.mjs";
import { kfzListPath, rootDir } from "./lib/load-env.mjs";

function parseArgs(argv) {
  const countsIdx = argv.indexOf("--counts");
  return {
    listPath: kfzListPath,
    countsPath:
      countsIdx >= 0 ? resolve(rootDir, argv[countsIdx + 1]) : null,
  };
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function main() {
  const { listPath, countsPath } = parseArgs(process.argv.slice(2));
  const list = loadJson(listPath);
  const entries = Object.entries(list.data ?? {});

  if (entries.length === 0) {
    throw new Error(`No entries found in ${listPath}`);
  }

  const counts = countsPath ? loadJson(countsPath).data ?? {} : {};
  const listCodes = new Set(entries.map(([code]) => code));

  const conn = await getPool().connect();

  try {
    await conn.query("begin");

    for (const [code, row] of entries) {
      const count = counts[code] ?? 0;
      await conn.query(
        `insert into kfz.prefixes (code, ursprung, landkreis, bundesland, count)
         values ($1, $2, $3, $4, $5)
         on conflict (code) do update set
           ursprung = excluded.ursprung,
           landkreis = excluded.landkreis,
           bundesland = excluded.bundesland,
           count = case
             when $6::boolean then excluded.count
             else kfz.prefixes.count
           end`,
        [
          code,
          row.ursprung,
          row.landkreis,
          row.bundesland,
          count,
          Boolean(countsPath),
        ],
      );
    }

    await conn.query("commit");

    const legacy = await conn.query(
      `select count(*)::int as n
       from kfz.prefixes
       where code <> all($1::text[])`,
      [Array.from(listCodes)],
    );
    const legacyCount = legacy.rows[0]?.n ?? 0;

    console.log(
      `Synced ${entries.length} prefixes from ${listPath}` +
        (countsPath ? ` with counts from ${countsPath}` : "") +
        (legacyCount > 0
          ? `; ${legacyCount} legacy prefix(es) retained (not in list)`
          : ""),
    );
  } catch (error) {
    await conn.query("rollback");
    throw error;
  } finally {
    conn.release();
    await closePool();
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
