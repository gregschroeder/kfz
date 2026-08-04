#!/usr/bin/env node
/**
 * Download BKG KFZ250, simplify for the PWA, diff vs data/kfz-list.json.
 *
 *   pnpm geo:kfz250
 *
 * Writes:
 *   data/geo/kfz250.raw.geojson   — full WFS download (WGS84)
 *   data/geo/kfz250.geojson       — simplified + normalized props
 *   data/geo/bundeslaender.geojson — dissolved Bundesland outlines
 *   data/geo/pseudo.geojson       — national + per-prefix islands for codes missing from KFZ250
 *   data/geo/kfz250.meta.json
 *   data/geo/kfz250.diff.json
 *   web/public/geo/*              — copies for the PWA (no raw)
 *
 * Source: https://sgx.geodatenzentrum.de/wfs_kfz250
 * License: Datenlizenz Deutschland – Namensnennung – Version 2.0
 * Attribution: © GeoBasis-DE / BKG, Datenquellen: Kraftfahrt-Bundesamt
 */
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import simplify from "@turf/simplify";
import union from "@turf/union";
import bbox from "@turf/bbox";
import { featureCollection } from "@turf/helpers";

const ROOT = resolve(import.meta.dirname, "..");
const DATA_GEO = resolve(ROOT, "data/geo");
const PUBLIC_GEO = resolve(ROOT, "web/public/geo");

const WFS_URL =
  "https://sgx.geodatenzentrum.de/wfs_kfz250?service=WFS&version=2.0.0" +
  "&request=GetFeature&typeNames=kfz:kfz250&outputFormat=application/json" +
  "&srsName=EPSG:4326&count=1000";

const PSEUDO_BUNDESLAENDER = new Set(["bundesweit", "Filmproduktion"]);

/** ARS (Amtlicher Regionalschlüssel) Land digit → app bundesland name */
const ARS_LAND = {
  "01": "Schleswig-Holstein",
  "02": "Hamburg",
  "03": "Niedersachsen",
  "04": "Bremen",
  "05": "Nordrhein-Westfalen",
  "06": "Hessen",
  "07": "Rheinland-Pfalz",
  "08": "Baden-Württemberg",
  "09": "Bayern",
  "10": "Saarland",
  "11": "Berlin",
  "12": "Brandenburg",
  "13": "Mecklenburg-Vorpommern",
  "14": "Sachsen",
  "15": "Sachsen-Anhalt",
  "16": "Thüringen",
};

function splitKfz(raw) {
  return String(raw ?? "")
    .trim()
    .split(/\s+/u)
    .map((s) => s.toLocaleUpperCase("de-DE"))
    .filter(Boolean);
}

function landFromArs(ars) {
  const key = String(ars ?? "").padStart(2, "0").slice(0, 2);
  return ARS_LAND[key] ?? "unbekannt";
}

async function downloadRaw() {
  console.error("→ fetching KFZ250 WFS…");
  const res = await fetch(WFS_URL);
  if (!res.ok) {
    throw new Error(`WFS download failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (!json?.features?.length) {
    throw new Error("WFS returned no features");
  }
  console.error(`  ${json.features.length} features`);
  return json;
}

function normalizeFeature(f) {
  const p = f.properties ?? {};
  const kfz = splitKfz(p.kfz);
  return {
    type: "Feature",
    properties: {
      name: String(p.name ?? ""),
      ars: String(p.ars ?? ""),
      land: landFromArs(p.ars),
      oba: String(p.oba ?? ""),
      kfz,
      haupt: kfz[0] ?? "",
    },
    geometry: f.geometry,
  };
}

function simplifyCollection(fc) {
  const features = fc.features.map((f) => {
    try {
      return simplify(f, {
        tolerance: 0.004,
        highQuality: true,
        mutate: false,
      });
    } catch {
      return f;
    }
  });
  return { type: "FeatureCollection", features };
}

function loadAppPrefixes() {
  const list = JSON.parse(
    readFileSync(resolve(ROOT, "data/kfz-list.json"), "utf8"),
  );
  /** @type {Map<string, { bundesland: string, ursprung: string, landkreis: string }>} */
  const byCode = new Map();
  for (const [code, v] of Object.entries(list.data ?? {})) {
    byCode.set(String(code).toLocaleUpperCase("de-DE"), {
      bundesland: v.bundesland ?? "",
      ursprung: v.ursprung ?? "",
      landkreis: v.landkreis ?? "",
    });
  }
  return byCode;
}

function buildDiff(mapCodes, appByCode) {
  const appCodes = new Set(appByCode.keys());
  const onlyInMap = [...mapCodes].filter((c) => !appCodes.has(c)).sort();
  const onlyInApp = [...appCodes].filter((c) => !mapCodes.has(c));
  const pseudo = [];
  const unmapped = [];
  for (const code of onlyInApp.sort()) {
    const bl = appByCode.get(code)?.bundesland ?? "";
    if (PSEUDO_BUNDESLAENDER.has(bl)) {
      pseudo.push({ code, bundesland: bl });
    } else {
      unmapped.push({
        code,
        bundesland: bl,
        landkreis: appByCode.get(code)?.landkreis ?? "",
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      map: mapCodes.size,
      app: appCodes.size,
      both: [...mapCodes].filter((c) => appCodes.has(c)).length,
      onlyInMap: onlyInMap.length,
      onlyInAppPseudo: pseudo.length,
      onlyInAppUnmapped: unmapped.length,
    },
    onlyInMap,
    onlyInAppPseudo: pseudo,
    onlyInAppUnmapped: unmapped,
  };
}

function rectPolygon(cx, cy, w, h) {
  const hw = w / 2;
  const hh = h / 2;
  return {
    type: "Polygon",
    coordinates: [
      [
        [cx - hw, cy - hh],
        [cx + hw, cy - hh],
        [cx + hw, cy + hh],
        [cx - hw, cy + hh],
        [cx - hw, cy - hh],
      ],
    ],
  };
}

function dissolveBundeslaender(features) {
  /** @type {Map<string, typeof features>} */
  const byLand = new Map();
  for (const f of features) {
    const land = f.properties.land;
    if (!byLand.has(land)) byLand.set(land, []);
    byLand.get(land).push(f);
  }

  const out = [];
  for (const [land, feats] of [...byLand.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "de"),
  )) {
    console.error(`  dissolving ${land} (${feats.length} parts)…`);
    let merged = feats[0];
    for (let i = 1; i < feats.length; i++) {
      try {
        const u = union(featureCollection([merged, feats[i]]));
        if (u?.geometry) {
          merged = { type: "Feature", properties: {}, geometry: u.geometry };
        }
      } catch {
        // keep previous merge on topology failure
      }
    }
    let geometry = merged.geometry;
    try {
      const simp = simplify(
        { type: "Feature", properties: {}, geometry },
        { tolerance: 0.006, highQuality: true, mutate: false },
      );
      geometry = simp.geometry;
    } catch {
      // keep unsmoothed dissolve
    }
    const kfz = [
      ...new Set(feats.flatMap((f) => f.properties.kfz ?? [])),
    ].sort((a, b) => a.localeCompare(b, "de"));
    out.push({
      type: "Feature",
      properties: {
        name: land,
        land,
        ars: "",
        oba: "bundesland",
        kfz,
        haupt: kfz[0] ?? "",
        level: "land",
      },
      geometry,
    });
  }
  return { type: "FeatureCollection", features: out };
}

function buildPseudo(appByCode, unmapped, landFc) {
  /** @type {Record<string, string[]>} */
  const byBl = { bundesweit: [], Filmproduktion: [] };
  for (const [code, meta] of appByCode) {
    if (PSEUDO_BUNDESLAENDER.has(meta.bundesland)) {
      byBl[meta.bundesland].push(code);
    }
  }
  for (const k of Object.keys(byBl)) {
    byBl[k].sort((a, b) => a.localeCompare(b, "de"));
  }

  /** @type {Map<string, string[]>} */
  const unmappedByLand = new Map();
  for (const entry of unmapped) {
    const land = entry.bundesland;
    if (!land || PSEUDO_BUNDESLAENDER.has(land)) continue;
    if (!unmappedByLand.has(land)) unmappedByLand.set(land, []);
    unmappedByLand.get(land).push(entry.code);
  }

  const features = [
    {
      type: "Feature",
      properties: {
        name: "bundesweit",
        land: "bundesweit",
        ars: "",
        oba: "pseudo",
        kfz: byBl.bundesweit,
        haupt: byBl.bundesweit[0] ?? "",
        pseudo: true,
        level: "land",
      },
      geometry: rectPolygon(20.8, 52.3, 3.2, 2.6),
    },
    {
      type: "Feature",
      properties: {
        name: "Filmproduktion",
        land: "Filmproduktion",
        ars: "",
        oba: "pseudo",
        kfz: byBl.Filmproduktion,
        haupt: byBl.Filmproduktion[0] ?? "",
        pseudo: true,
        level: "land",
      },
      geometry: rectPolygon(20.8, 49.2, 3.2, 2.4),
    },
  ];

  for (const [land, codes] of [...unmappedByLand.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "de"),
  )) {
    codes.sort((a, b) => a.localeCompare(b, "de"));
    const landFeat = landFc.features.find((f) => f.properties.land === land);
    let baseX = 13;
    let baseY = 51;
    let w = 0.42;
    let h = 0.32;
    if (landFeat) {
      const [minX, minY, maxX, maxY] = bbox(landFeat);
      const spanX = Math.max(0.4, maxX - minX);
      const spanY = Math.max(0.3, maxY - minY);
      w = Math.min(0.7, Math.max(0.32, spanX * 0.12));
      h = Math.min(0.55, Math.max(0.24, spanY * 0.12));
      baseX = maxX + w * 0.85;
      baseY = (minY + maxY) / 2 + ((codes.length - 1) * h * 1.15) / 2;
    }
    // One island per prefix (Landtag / Altkennzeichen missing from KFZ250).
    codes.forEach((code, i) => {
      features.push({
        type: "Feature",
        properties: {
          name: code,
          land,
          ars: "",
          oba: "unmapped",
          kfz: [code],
          haupt: code,
          pseudo: true,
          unmapped: true,
          level: "region",
        },
        geometry: rectPolygon(baseX, baseY - i * h * 1.15, w, h),
      });
    });
  }

  return { type: "FeatureCollection", features };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, "utf8");
}

function writeJsonPretty(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  mkdirSync(DATA_GEO, { recursive: true });
  mkdirSync(PUBLIC_GEO, { recursive: true });

  const raw = await downloadRaw();
  writeJson(resolve(DATA_GEO, "kfz250.raw.geojson"), raw);
  console.error(`→ data/geo/kfz250.raw.geojson (${Buffer.byteLength(JSON.stringify(raw))} bytes)`);

  const normalized = {
    type: "FeatureCollection",
    features: raw.features.map(normalizeFeature),
  };
  const simplified = simplifyCollection(normalized);
  writeJson(resolve(DATA_GEO, "kfz250.geojson"), simplified);
  const simpBytes = Buffer.byteLength(JSON.stringify(simplified));
  console.error(`→ data/geo/kfz250.geojson (${simpBytes} bytes)`);

  const appByCode = loadAppPrefixes();
  const mapCodes = new Set();
  for (const f of simplified.features) {
    for (const c of f.properties.kfz) mapCodes.add(c);
  }

  const diff = buildDiff(mapCodes, appByCode);
  writeJsonPretty(resolve(DATA_GEO, "kfz250.diff.json"), diff);
  console.error("→ data/geo/kfz250.diff.json");
  console.error(
    `  map=${diff.counts.map} app=${diff.counts.app} both=${diff.counts.both} ` +
      `onlyMap=${diff.counts.onlyInMap} pseudo=${diff.counts.onlyInAppPseudo} unmapped=${diff.counts.onlyInAppUnmapped}`,
  );
  if (diff.onlyInMap.length) {
    console.error(`  onlyInMap: ${diff.onlyInMap.join(" ")}`);
  }
  if (diff.onlyInAppUnmapped.length) {
    console.error(
      `  unmapped: ${diff.onlyInAppUnmapped.map((x) => x.code).join(" ")}`,
    );
  }

  console.error("→ dissolving Bundesländer…");
  const lands = dissolveBundeslaender(simplified.features);
  writeJson(resolve(DATA_GEO, "bundeslaender.geojson"), lands);
  console.error(
    `→ data/geo/bundeslaender.geojson (${lands.features.length} Länder, ${Buffer.byteLength(JSON.stringify(lands))} bytes)`,
  );

  const pseudo = buildPseudo(appByCode, diff.onlyInAppUnmapped, lands);
  writeJsonPretty(resolve(DATA_GEO, "pseudo.geojson"), pseudo);
  console.error(
    `→ data/geo/pseudo.geojson (${pseudo.features.length} features)`,
  );

  const meta = {
    generatedAt: new Date().toISOString(),
    source: WFS_URL.split("&")[0],
    sourceFull: "https://gdz.bkg.bund.de/index.php/default/open-data/kfz-kennzeichen-1-250-000-kfz250.html",
    license: "Datenlizenz Deutschland – Namensnennung – Version 2.0",
    attribution:
      "© GeoBasis-DE / BKG, Datenquellen: Kraftfahrt-Bundesamt",
    features: simplified.features.length,
    bundeslaender: lands.features.length,
    pseudoFeatures: pseudo.features.length,
    mapPrefixCount: mapCodes.size,
    simplifyTolerance: 0.004,
    rawBytes: Buffer.byteLength(JSON.stringify(raw)),
    simplifiedBytes: simpBytes,
    diff: diff.counts,
  };
  writeJsonPretty(resolve(DATA_GEO, "kfz250.meta.json"), meta);
  console.error("→ data/geo/kfz250.meta.json");

  for (const name of [
    "kfz250.geojson",
    "bundeslaender.geojson",
    "pseudo.geojson",
    "kfz250.meta.json",
    "kfz250.diff.json",
  ]) {
    copyFileSync(resolve(DATA_GEO, name), resolve(PUBLIC_GEO, name));
  }
  console.error("→ web/public/geo/ (copies, excluding raw)");

  writeFileSync(
    resolve(DATA_GEO, "README.md"),
    `# geo/

KFZ Zulassungsbezirk polygons for the progress map.

## Refresh

\`\`\`bash
pnpm geo:kfz250
\`\`\`

Downloads [BKG KFZ250](https://gdz.bkg.bund.de/index.php/default/open-data/kfz-kennzeichen-1-250-000-kfz250.html) via WFS, simplifies geometry, dissolves Bundesländer, builds pseudo regions (national + per-land unmapped), diffs against \`data/kfz-list.json\`, and copies runtime assets to \`web/public/geo/\`.

## Attribution

© GeoBasis-DE / BKG, Datenquellen: Kraftfahrt-Bundesamt  
License: [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0)

## Files

| File | Role |
|------|------|
| \`kfz250.raw.geojson\` | Full WFS download (WGS84) |
| \`kfz250.geojson\` | Simplified district features for land drill-in |
| \`bundeslaender.geojson\` | Dissolved Bundesland outlines for country view |
| \`pseudo.geojson\` | National Sonderkennzeichen + per-prefix islands for codes missing from KFZ250 |
| \`kfz250.meta.json\` | Fetch metadata |
| \`kfz250.diff.json\` | Map ↔ app prefix set diff |
`,
    "utf8",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
