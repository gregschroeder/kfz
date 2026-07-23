#!/usr/bin/env node
/**
 * Build + sign the KZQ (Kennzeichen Queue) Apple Shortcut.
 *
 *   pnpm shortcuts:build              # prod URL → shortcuts/kzq/KZQ.shortcut (+ Pages)
 *   pnpm shortcuts:build -- --local   # local functions URL → KZQ.local.shortcut
 *
 * Requires macOS `shortcuts` CLI. Local mode needs `pnpm dev:local` / supabase running.
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildShortcutPlist } from "../shortcuts/kzq/definition.mjs";
import { LOCAL_API_KEY, readLocalSupabaseEnv } from "./lib/local-env.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outDir = resolve(rootDir, "shortcuts/kzq");
const pagesDir = resolve(rootDir, "web/public/shortcuts");
const localMode = process.argv.includes("--local");

mkdirSync(outDir, { recursive: true });

let functionsUrl;
let signedName;
let copyToPages = false;

if (localMode) {
  const env = readLocalSupabaseEnv(rootDir);
  functionsUrl = `${env.functionsUrl.replace(/\/$/, "")}/kfz-capture`;
  signedName = "KZQ.local.shortcut";
} else {
  functionsUrl = undefined; // definition default (prod)
  signedName = "KZQ.shortcut";
  copyToPages = true;
  mkdirSync(pagesDir, { recursive: true });
}

const unsignedPath = resolve(outDir, "KZQ.unsigned.shortcut");
const signedPath = resolve(outDir, signedName);
const pagesPath = resolve(pagesDir, "KZQ.shortcut");

const xml = buildShortcutPlist(
  functionsUrl ? { functionsUrl } : undefined,
);
writeFileSync(unsignedPath, xml, "utf8");

const lint = spawnSync("plutil", ["-lint", unsignedPath], { encoding: "utf8" });
if (lint.status !== 0) {
  console.error(lint.stdout || lint.stderr);
  process.exit(1);
}

if (!existsSync("/usr/bin/shortcuts")) {
  console.error("macOS `shortcuts` CLI not found — cannot sign.");
  process.exit(1);
}

const sign = spawnSync(
  "shortcuts",
  ["sign", "--mode", "anyone", "--input", unsignedPath, "--output", signedPath],
  { encoding: "utf8" },
);
if (sign.status !== 0) {
  console.error(sign.stdout || sign.stderr || "shortcuts sign failed");
  process.exit(1);
}

if (copyToPages) {
  copyFileSync(signedPath, pagesPath);
  console.error(`→ signed ${signedPath}`);
  console.error(`→ pages  ${pagesPath}`);
  console.error("");
  console.error("Install after deploy:");
  console.error("  https://kfz.schroeder.org/shortcuts/");
} else {
  console.error(`→ signed ${signedPath}`);
  console.error(`→ URL    ${functionsUrl}`);
  console.error(`→ key    ${LOCAL_API_KEY}`);
  console.error("");
  console.error("Test on this Mac:");
  console.error(`  open ${signedPath}`);
  console.error(`  (import key: ${LOCAL_API_KEY})`);
}
