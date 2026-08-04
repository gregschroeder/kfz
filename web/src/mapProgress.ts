import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PrefixResult } from "./api";

export type MapFeatureProps = {
  name: string;
  land: string;
  ars: string;
  kfz: string[];
  haupt?: string;
  pseudo?: boolean;
  unmapped?: boolean;
  level?: string;
  oba?: string;
};

export type ProgressMapHandlers = {
  onLandSelect: (land: string) => void;
  onRegionSelect: (props: MapFeatureProps, items: PrefixResult[]) => void;
};

type GeoFeature = GeoJSON.Feature<GeoJSON.Geometry, MapFeatureProps>;
type GeoCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, MapFeatureProps>;

const OVERVIEW_BOUNDS = L.latLngBounds([47.0, 5.5], [55.2, 23.0]);

/** White → yellow → yellow-green → pale green → medium green */
export function colorForPct(pct: number | null): string {
  if (pct === null || Number.isNaN(pct)) return "#6b7280";
  if (pct <= 0) return "#f8fafc";
  if (pct < 0.25) return "#facc15";
  if (pct < 0.5) return "#a3e635";
  if (pct < 0.75) return "#86efac";
  if (pct < 1) return "#4ade80";
  return "#16a34a";
}

export function featureStats(
  kfz: string[],
  byCode: Map<string, PrefixResult>,
): { found: number; total: number; pct: number | null; items: PrefixResult[] } {
  const items: PrefixResult[] = [];
  let found = 0;
  for (const code of kfz) {
    const row = byCode.get(code);
    if (!row) continue;
    items.push(row);
    if (row.count > 0) found += 1;
  }
  const total = items.length;
  return {
    found,
    total,
    pct: total === 0 ? null : found / total,
    items,
  };
}

export function featureKey(props: MapFeatureProps): string {
  if (props.unmapped) {
    const code = props.haupt || props.kfz?.[0] || props.name;
    return `unmapped:${props.land}:${code}`;
  }
  if (props.ars) return `ars:${props.ars}`;
  return `name:${props.land}:${props.name}:${props.haupt ?? ""}`;
}

export type RegionSummary = {
  key: string;
  name: string;
  land: string;
  found: number;
  total: number;
  percent: number;
  props: MapFeatureProps;
  items: PrefixResult[];
  unmapped?: boolean;
};

export type ProgressMap = {
  setCounts: (byCode: Map<string, PrefixResult>) => void;
  setLandPct: (byLand: Map<string, number | null>) => void;
  showCountry: () => void;
  showLand: (land: string) => RegionSummary[];
  highlightKey: (key: string | null) => void;
  highlightLand: (land: string | null) => void;
  invalidateSize: () => void;
  destroy: () => void;
};

function pathStyle(
  fill: string,
  opts: { pseudo?: boolean; selected?: boolean; nullPct?: boolean },
): L.PathOptions {
  return {
    fillColor: fill,
    fillOpacity: opts.nullPct ? 0.35 : 0.85,
    color: opts.selected ? "#f97316" : "#1f2937",
    weight: opts.selected ? 3 : opts.pseudo ? 2 : 0.9,
    opacity: 0.95,
  };
}

export async function createProgressMap(
  container: HTMLElement,
  handlers: ProgressMapHandlers,
): Promise<ProgressMap> {
  const [landRes, kfzRes, pseudoRes, metaRes] = await Promise.all([
    fetch("/geo/bundeslaender.geojson"),
    fetch("/geo/kfz250.geojson"),
    fetch("/geo/pseudo.geojson"),
    fetch("/geo/kfz250.meta.json"),
  ]);
  if (!landRes.ok || !kfzRes.ok) throw new Error("Could not load map geometry");

  const landGeo = (await landRes.json()) as GeoCollection;
  const kfzGeo = (await kfzRes.json()) as GeoCollection;
  const pseudoGeo: GeoCollection = pseudoRes.ok
    ? ((await pseudoRes.json()) as GeoCollection)
    : { type: "FeatureCollection", features: [] };
  const meta = metaRes.ok
    ? ((await metaRes.json()) as { attribution?: string })
    : {};

  const nationalPseudo = {
    type: "FeatureCollection",
    features: pseudoGeo.features.filter(
      (f) => f.properties.pseudo && !f.properties.unmapped,
    ),
  } as GeoCollection;

  let byCode = new Map<string, PrefixResult>();
  let byLandPct = new Map<string, number | null>();
  let mode: "country" | "land" = "country";
  let currentLand: string | null = null;
  let selectedKey: string | null = null;
  let activeLayer: L.GeoJSON | null = null;
  const labelMarkers: L.Marker[] = [];

  const map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    // Page scroll owns one-finger pan; pinch / +/- to zoom.
    scrollWheelZoom: false,
    dragging: false,
    touchZoom: true,
    minZoom: 4,
    maxZoom: 12,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 12,
    minZoom: 4,
  }).addTo(map);

  const attr = meta.attribution ?? "© GeoBasis-DE / BKG, Kraftfahrt-Bundesamt";
  map.attributionControl.addAttribution(attr);

  function clearLabels(): void {
    for (const m of labelMarkers) map.removeLayer(m);
    labelMarkers.length = 0;
  }

  function addPseudoLabels(features: GeoFeature[]): void {
    clearLabels();
    for (const f of features) {
      if (!f.properties.pseudo || f.geometry?.type !== "Polygon") continue;
      const ring = f.geometry.coordinates[0];
      const lats = ring.map((c) => c[1]);
      const lngs = ring.map((c) => c[0]);
      const center = L.latLng(
        (Math.min(...lats) + Math.max(...lats)) / 2,
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
      );
      // Unmapped islands are individual prefixes; national pseudo Länder keep their name.
      const label = f.properties.unmapped
        ? f.properties.haupt?.trim() ||
          f.properties.kfz?.[0] ||
          f.properties.name
        : f.properties.name || f.properties.land;
      const marker = L.marker(center, {
        interactive: false,
        icon: L.divIcon({
          className: "stats-map-pseudo-label",
          html: `<span>${escapeHtml(label)}</span>`,
        }),
      }).addTo(map);
      labelMarkers.push(marker);
    }
  }

  function styleCountry(feature?: GeoFeature): L.PathOptions {
    const props = feature?.properties;
    if (!props) return pathStyle("#6b7280", { nullPct: true });
    const pct = byLandPct.has(props.land)
      ? byLandPct.get(props.land)!
      : featureStats(props.kfz ?? [], byCode).pct;
    const key = featureKey(props);
    return pathStyle(colorForPct(pct), {
      pseudo: Boolean(props.pseudo),
      selected: selectedKey === key,
      nullPct: pct === null,
    });
  }

  function styleRegion(feature?: GeoFeature): L.PathOptions {
    const props = feature?.properties;
    if (!props) return pathStyle("#6b7280", { nullPct: true });
    const { pct } = featureStats(props.kfz ?? [], byCode);
    const key = featureKey(props);
    return pathStyle(colorForPct(pct), {
      pseudo: Boolean(props.pseudo),
      selected: selectedKey === key,
      nullPct: pct === null,
    });
  }

  function clearActiveLayer(): void {
    if (activeLayer) {
      map.removeLayer(activeLayer);
      activeLayer = null;
    }
    clearLabels();
  }

  function showCountry(): void {
    mode = "country";
    currentLand = null;
    selectedKey = null;
    clearActiveLayer();

    const collection: GeoCollection = {
      type: "FeatureCollection",
      features: [...landGeo.features, ...nationalPseudo.features],
    };

    activeLayer = L.geoJSON(collection, {
      style: (f) => styleCountry(f as GeoFeature),
      onEachFeature: (f, layer) => {
        const feature = f as GeoFeature;
        layer.on("click", () => {
          handlers.onLandSelect(feature.properties.land);
        });
      },
    }).addTo(map);

    addPseudoLabels(nationalPseudo.features);
    fitCurrentView(true);
  }

  function fitCurrentView(animate = false): void {
    if (activeLayer && activeLayer.getLayers().length) {
      const opts: L.FitBoundsOptions = {
        padding: mode === "land" ? [16, 16] : [10, 10],
        animate,
      };
      if (mode === "land") {
        opts.maxZoom =
          currentLand === "bundesweit" || currentLand === "Filmproduktion"
            ? 8
            : 10;
      }
      map.fitBounds(activeLayer.getBounds(), opts);
      return;
    }
    map.fitBounds(OVERVIEW_BOUNDS, { padding: [10, 10], animate });
  }

  function regionsForLand(land: string): GeoFeature[] {
    const districts = kfzGeo.features.filter((f) => f.properties.land === land);
    const unmapped = pseudoGeo.features.filter(
      (f) => f.properties.unmapped && f.properties.land === land,
    );
    // National pseudo lands have no districts — show the land island itself.
    if (!districts.length) {
      const national = nationalPseudo.features.filter(
        (f) => f.properties.land === land,
      );
      return [...national, ...unmapped];
    }
    return [...districts, ...unmapped];
  }

  function summarizeRegions(features: GeoFeature[]): RegionSummary[] {
    return features
      .map((f) => {
        const stats = featureStats(f.properties.kfz ?? [], byCode);
        const haupt =
          f.properties.haupt?.trim() ||
          f.properties.kfz?.[0] ||
          f.properties.name;
        return {
          key: featureKey(f.properties),
          name: haupt,
          land: f.properties.land,
          found: stats.found,
          total: stats.total,
          percent: stats.pct === null ? 0 : stats.pct * 100,
          props: f.properties,
          items: stats.items,
          unmapped: Boolean(f.properties.unmapped),
        };
      })
      .sort((a, b) => {
        if (a.unmapped !== b.unmapped) return a.unmapped ? 1 : -1;
        if (b.percent !== a.percent) return b.percent - a.percent;
        return a.name.localeCompare(b.name, "de");
      });
  }

  function showLand(land: string): RegionSummary[] {
    mode = "land";
    currentLand = land;
    selectedKey = null;
    clearActiveLayer();

    const features = regionsForLand(land);
    const collection: GeoCollection = {
      type: "FeatureCollection",
      features,
    };

    activeLayer = L.geoJSON(collection, {
      style: (f) => styleRegion(f as GeoFeature),
      onEachFeature: (f, layer) => {
        const feature = f as GeoFeature;
        layer.on("click", () => {
          const stats = featureStats(feature.properties.kfz ?? [], byCode);
          handlers.onRegionSelect(feature.properties, stats.items);
        });
      },
    }).addTo(map);

    addPseudoLabels(features.filter((f) => f.properties.pseudo));
    fitCurrentView(true);
    return summarizeRegions(features);
  }

  function restyle(): void {
    if (!activeLayer) return;
    if (mode === "country") {
      activeLayer.setStyle((f) => styleCountry(f as GeoFeature));
    } else {
      activeLayer.setStyle((f) => styleRegion(f as GeoFeature));
    }
  }

  function setCounts(next: Map<string, PrefixResult>): void {
    byCode = next;
    restyle();
  }

  function setLandPct(next: Map<string, number | null>): void {
    byLandPct = next;
    if (mode === "country") restyle();
  }

  function highlightKey(key: string | null): void {
    selectedKey = key;
    restyle();
    if (!key || !activeLayer) return;
    activeLayer.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: GeoFeature }).feature;
      if (feature && featureKey(feature.properties) === key) {
        const path = layer as L.Path;
        if (typeof path.bringToFront === "function") path.bringToFront();
        if (typeof (layer as L.Polygon).getBounds === "function") {
          map.fitBounds((layer as L.Polygon).getBounds(), {
            padding: [28, 28],
            animate: true,
            maxZoom: 11,
          });
        }
      }
    });
  }

  function highlightLand(land: string | null): void {
    if (!land || !activeLayer) {
      highlightKey(null);
      return;
    }
    let match: string | null = null;
    activeLayer.eachLayer((layer) => {
      const feature = (layer as L.Layer & { feature?: GeoFeature }).feature;
      if (feature?.properties.land === land && !feature.properties.unmapped) {
        match = featureKey(feature.properties);
      }
    });
    highlightKey(match);
  }

  function invalidateSize(): void {
    map.invalidateSize({ animate: false });
    // Re-fit after height changes (e.g. 40% pane) so we aren't stuck zoomed in.
    fitCurrentView(false);
  }

  function destroy(): void {
    clearLabels();
    map.remove();
  }

  showCountry();

  return {
    setCounts,
    setLandPct,
    showCountry,
    showLand,
    highlightKey,
    highlightLand,
    invalidateSize,
    destroy,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function legendHtml(): string {
  const stops = [
    { label: "0%", color: colorForPct(0) },
    { label: "¼", color: colorForPct(0.2) },
    { label: "½", color: colorForPct(0.4) },
    { label: "¾", color: colorForPct(0.7) },
    { label: "100%", color: colorForPct(1) },
  ];
  return `
    <div class="stats-map-legend" aria-hidden="true">
      ${stops
        .map(
          (s) =>
            `<span class="stats-map-legend-swatch" style="background:${s.color}"></span><span class="stats-map-legend-label">${s.label}</span>`,
        )
        .join("")}
    </div>`;
}
