#!/usr/bin/env node
/**
 * Keep web/public/sw.js CACHE_VERSION aligned with web/src/app-version.json.
 *
 * Semver: major.minor are manual; patch (= build) is bumped by CI on deploy.
 *
 *   node scripts/sync-app-version.mjs
 *   node scripts/sync-app-version.mjs --bump-patch
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const VERSION_PATH = resolve(ROOT, "web/src/app-version.json");
const SW_PATH = resolve(ROOT, "web/public/sw.js");

/**
 * @returns {{ major: number, minor: number, patch: number }}
 */
function readVersionFile() {
  const raw = JSON.parse(readFileSync(VERSION_PATH, "utf8"));
  const major = Number(raw.major);
  const minor = Number(raw.minor);
  const patch = Number(raw.patch);
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) {
    throw new Error(`Invalid semver fields in ${VERSION_PATH}`);
  }
  return { major, minor, patch };
}

function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function writeVersionFile(ver) {
  writeFileSync(
    VERSION_PATH,
    `${JSON.stringify(
      { major: ver.major, minor: ver.minor, patch: ver.patch },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function syncSw(version) {
  const sw = readFileSync(SW_PATH, "utf8");
  if (!/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    throw new Error(`CACHE_VERSION declaration not found in ${SW_PATH}`);
  }
  const next = sw.replace(
    /const CACHE_VERSION = "[^"]+";/,
    `const CACHE_VERSION = "${version}";`,
  );
  writeFileSync(SW_PATH, next, "utf8");
}

const bumpPatch = process.argv.includes("--bump-patch");
const ver = readVersionFile();
if (bumpPatch) {
  ver.patch += 1;
  writeVersionFile(ver);
  console.error(`→ bumped patch to ${formatVersion(ver)}`);
} else {
  console.error(`→ app version ${formatVersion(ver)}`);
}

const version = formatVersion(ver);
syncSw(version);
console.error(`→ web/public/sw.js CACHE_VERSION = ${version}`);
console.log(version);
