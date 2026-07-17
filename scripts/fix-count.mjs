#!/usr/bin/env node
/**
 * Adjust sighting count for one prefix (corrections / undo mistaken lookups).
 *
 * Usage:
 *   pnpm data:local:fix-count -- KF 2
 *   pnpm data:prod:fix-count -- KF 2
 */
import { closePool, queryDb } from "./lib/db.mjs";
import { initEnvForScript } from "./lib/load-env.mjs";

function usage() {
  console.error("Usage: pnpm data:prod:fix-count -- <PREFIX> <COUNT>");
  console.error("       pnpm data:prod:fix-count -- <PREFIX> --decrement");
  process.exit(1);
}

async function main() {
  initEnvForScript();

  const [prefixArg, valueArg] = process.argv.slice(2);
  if (!prefixArg) usage();

  const code = prefixArg.toUpperCase().trim();

  if (valueArg === "--decrement") {
    const result = await queryDb(
      `update kfz.prefixes
       set count = greatest(count - 1, 0)
       where code = $1
       returning code, count, queried_at`,
      [code],
    );
    if (result.rowCount === 0) {
      throw new Error(`Unknown prefix: ${code}`);
    }
    console.log(result.rows[0]);
    return;
  }

  if (valueArg === undefined) usage();

  const count = Number(valueArg);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Count must be a non-negative integer");
  }

  const result = await queryDb(
    `update kfz.prefixes
     set count = $2
     where code = $1
     returning code, count, queried_at`,
    [code, count],
  );

  if (result.rowCount === 0) {
    throw new Error(`Unknown prefix: ${code}`);
  }

  console.log(result.rows[0]);
}

main()
  .catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  })
  .finally(() => closePool());
