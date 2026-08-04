# geo/

KFZ Zulassungsbezirk polygons for the progress map.

## Refresh

```bash
pnpm geo:kfz250
```

Downloads [BKG KFZ250](https://gdz.bkg.bund.de/index.php/default/open-data/kfz-kennzeichen-1-250-000-kfz250.html) via WFS, simplifies geometry, dissolves Bundesländer, builds pseudo regions (national + per-land unmapped), diffs against `data/kfz-list.json`, and copies runtime assets to `web/public/geo/`.

## Attribution

© GeoBasis-DE / BKG, Datenquellen: Kraftfahrt-Bundesamt  
License: [Datenlizenz Deutschland – Namensnennung – Version 2.0](https://www.govdata.de/dl-de/by-2-0)

## Files

| File | Role |
|------|------|
| `kfz250.raw.geojson` | Full WFS download (WGS84) |
| `kfz250.geojson` | Simplified district features for land drill-in |
| `bundeslaender.geojson` | Dissolved Bundesland outlines for country view |
| `pseudo.geojson` | National Sonderkennzeichen + per-prefix islands for codes missing from KFZ250 |
| `kfz250.meta.json` | Fetch metadata |
| `kfz250.diff.json` | Map ↔ app prefix set diff |
