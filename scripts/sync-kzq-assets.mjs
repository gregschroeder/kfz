#!/usr/bin/env node
/** Rasterize KZQ brand SVGs → web/public/shortcuts/ */
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";

const rootDir = resolve(import.meta.dirname, "..");
const assetsDir = join(rootDir, "assets");
const outDir = join(rootDir, "web/public/shortcuts");

await mkdir(outDir, { recursive: true });

await sharp(join(assetsDir, "kzq-logo.svg"))
  .resize(1040, 220, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(outDir, "kzq-logo.png"));

await sharp(join(assetsDir, "kzq-icon.svg"))
  .resize(512, 512)
  .png()
  .toFile(join(outDir, "kzq-icon.png"));

await sharp(join(assetsDir, "kzq-icon.svg"))
  .resize(180, 180)
  .png()
  .toFile(join(outDir, "kzq-icon-180.png"));

console.error("→ KZQ assets → web/public/shortcuts/");
