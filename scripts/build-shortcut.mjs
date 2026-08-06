#!/usr/bin/env node
/**
 * Build + sign the KZQ (Kennzeichen Queue) Apple Shortcut.
 *
 *   pnpm shortcuts:build              # prod URL → shortcuts/kzq/KZQ.shortcut (+ Pages)
 *   pnpm shortcuts:build -- --local   # local functions URL → KZQ.local.shortcut
 *   pnpm shortcuts:build -- --debug   # prod + Show Result steps → KZQ.debug.shortcut
 *   pnpm shortcuts:build -- --debug --local
 *
 * Requires macOS `shortcuts` CLI. Local mode needs `pnpm dev:local` / supabase running.
 *
 * Debug install on a phone (same Wi‑Fi), then Show on Apple Watch:
 *   pnpm shortcuts:build -- --debug
 *   pnpm web:dev
 *   open http://<mac-lan-ip>:5173/shortcuts/KZQ.debug.shortcut on the phone
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildShortcutPlist } from "../shortcuts/kzq/definition.mjs";
import { LOCAL_API_KEY, readLocalSupabaseEnv } from "./lib/local-env.mjs";

const rootDir = resolve(import.meta.dirname, "..");
const outDir = resolve(rootDir, "shortcuts/kzq");
const pagesDir = resolve(rootDir, "web/public/shortcuts");
const localMode = process.argv.includes("--local");
const debugMode = process.argv.includes("--debug");

mkdirSync(outDir, { recursive: true });
mkdirSync(pagesDir, { recursive: true });

/** Prefer a non-internal IPv4 (LAN) for phone download URLs. */
function lanIPv4() {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return null;
}

/** Rewrite 127.0.0.1 / localhost in a URL to the Mac's LAN IP (phone can't reach loopback). */
function lanifyUrl(url, lanIp) {
  if (!lanIp) return url;
  return url.replace(/:\/\/(127\.0\.0\.1|localhost)(?=[:/])/g, `://${lanIp}`);
}

let functionsUrl;
let signedName;
let workflowName;
let copyToPages = false;
let serveForPhone = false;

if (localMode) {
  const env = readLocalSupabaseEnv(rootDir);
  const lanIp = lanIPv4();
  functionsUrl = lanifyUrl(
    `${env.functionsUrl.replace(/\/$/, "")}/kfz-capture`,
    lanIp,
  );
  signedName = debugMode ? "KZQ.debug.local.shortcut" : "KZQ.local.shortcut";
  workflowName = debugMode ? "KZQ Debug Local" : "KZQ Local";
  serveForPhone = debugMode;
} else {
  functionsUrl = undefined; // definition default (prod)
  if (debugMode) {
    signedName = "KZQ.debug.shortcut";
    workflowName = "KZQ Debug";
    serveForPhone = true;
  } else {
    signedName = "KZQ.shortcut";
    workflowName = "KZQ";
    copyToPages = true;
  }
}

const unsignedPath = resolve(outDir, "KZQ.unsigned.shortcut");
const signedPath = resolve(outDir, signedName);
const pagesPath = resolve(pagesDir, signedName);

const xml = buildShortcutPlist({
  ...(functionsUrl ? { functionsUrl } : {}),
  debug: debugMode,
  name: workflowName,
});
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

if (copyToPages || serveForPhone) {
  copyFileSync(signedPath, pagesPath);
}

console.error(`→ signed ${signedPath}`);
if (copyToPages || serveForPhone) {
  console.error(`→ public ${pagesPath}`);
}
if (functionsUrl) {
  console.error(`→ URL    ${functionsUrl}`);
  console.error(`→ key    ${LOCAL_API_KEY}`);
}
if (debugMode) {
  console.error("→ debug  Show Result after Dictate / Spoken / Prefix / branch / POST");
}

console.error("");
if (serveForPhone) {
  const lanIp = lanIPv4();
  console.error("Install on phone (same Wi‑Fi as this Mac), then enable Watch:");
  console.error("  1. pnpm web:dev   # if not already running");
  if (lanIp) {
    console.error(`  2. On phone Safari: http://${lanIp}:5173/shortcuts/${signedName}`);
  } else {
    console.error(`  2. On phone Safari: http://<mac-lan-ip>:5173/shortcuts/${signedName}`);
  }
  console.error("  3. Import → enter API key");
  console.error("  4. Shortcuts → KZQ Debug → ⓘ → Show on Apple Watch");
  console.error("  5. Run from Watch — tap through each Show Result step");
} else if (localMode) {
  console.error("Test on this Mac:");
  console.error(`  open ${signedPath}`);
  console.error(`  (import key: ${LOCAL_API_KEY})`);
} else {
  console.error("Install after deploy:");
  console.error("  https://kfz.schroeder.org/shortcuts/");
}
