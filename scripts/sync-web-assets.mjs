#!/usr/bin/env node
/**
 * Sync logo/icons from assets/ → web/public/icons/ for the PWA.
 * Source of truth: icon-master.png and logo-plate-master.png
 */
import { mkdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";

const rootDir = resolve(import.meta.dirname, "..");
const assetsDir = join(rootDir, "assets");
const outDir = join(rootDir, "web/public/icons");

const iconMaster = join(assetsDir, "icon-master.png");
const logoPlateMaster = join(assetsDir, "logo-plate-master.png");

const iconPngSizes = [
  { name: "icon-16.png", size: 16 },
  { name: "icon-32.png", size: 32 },
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-16.png", size: 16 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-180.png", size: 180 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-maskable-512.png", size: 512 },
];

const staleOutputs = ["icon.svg", "icon-maskable.svg", "logo-plate.svg"];

async function resizeIcon(size, outName) {
  await sharp(iconMaster)
    .resize(size, size, { fit: "cover" })
    .png()
    .toFile(join(outDir, outName));
}

async function exportLogoPlate() {
  await sharp(logoPlateMaster)
    .trim({ threshold: 10 })
    .png()
    .toFile(join(outDir, "logo-plate.png"));
}

async function writePreviewHtml() {
  const { writeFile } = await import("node:fs/promises");
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KFZ Assets Preview</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0b1220;
      color: #e8eef7;
      padding: 2rem;
    }
    h1 { font-weight: 600; margin: 0 0 0.25rem; }
    p { color: #9fb0c7; margin: 0 0 2rem; }
    .grid {
      display: grid;
      gap: 1.5rem;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-width: 1100px;
    }
    .card {
      background: #141d2e;
      border: 1px solid #243049;
      border-radius: 16px;
      padding: 1.25rem;
    }
    .card h2 { font-size: 0.95rem; margin: 0 0 1rem; color: #c5d3e8; }
    .card img { max-width: 100%; height: auto; display: block; }
    .row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
    .row img { border-radius: 12px; }
  </style>
</head>
<body>
  <h1>KFZ assets</h1>
  <p>Synced from <code>assets/*-master.png</code> — edit masters there, then run <code>pnpm assets:sync</code>.</p>
  <div class="grid">
    <div class="card">
      <h2>App icon (512)</h2>
      <img src="icon-512.png" alt="App icon" width="256" />
    </div>
    <div class="card">
      <h2>Apple touch (180)</h2>
      <img src="apple-touch-icon.png" alt="Apple touch icon" width="180" />
    </div>
    <div class="card">
      <h2>Horizontal plate logo</h2>
      <img src="logo-plate.png" alt="KFZ license plate logo" width="780" />
    </div>
    <div class="card">
      <h2>Favicons</h2>
      <div class="row">
        <img src="favicon-32.png" alt="32px favicon" width="32" />
        <img src="favicon-16.png" alt="16px favicon" width="16" />
      </div>
    </div>
  </div>
</body>
</html>
`;
  await writeFile(join(outDir, "preview.html"), html);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  for (const { name, size } of iconPngSizes) {
    await resizeIcon(size, name);
  }

  await exportLogoPlate();
  await writePreviewHtml();

  for (const name of staleOutputs) {
    await unlink(join(outDir, name)).catch(() => {});
  }

  console.log("Synced assets/ → web/public/icons/");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
