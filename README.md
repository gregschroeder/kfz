# kfz

German license plate (KFZ) lookup — PWA + Watch deferred capture.

Shares the Supabase Postgres project with [hgv](../hgv) (`wchzccrcqlxgsftjbpgn`). App data lives in the **`kfz`** schema (`hgv` uses `hgv.*`).

## Prerequisites

- [nodenv](https://github.com/nodenv/nodenv) — Node version from `.node-version` (same as hgv/flippy)
- [pnpm](https://pnpm.io/) — via Corepack (`corepack enable`), pinned in `packageManager`
- Python 3 + venv for `scripts/kfz.py`
- Docker for local Supabase

```bash
nodenv install          # if 25.6.1 not installed yet
corepack enable
```

All CLI tools (`supabase`, etc.) are **devDependencies** — use `pnpm run …` or `pnpm exec …`, not global installs.

## Setup (scripted — no Supabase dashboard)

```bash
cp .env.example .env          # fill in passwords/keys
pnpm install
python3 -m venv venv && venv/bin/pip install -r requirements.txt

pnpm db:login
pnpm db:link                # links wchzccrcqlxgsftjbpgn
pnpm db:remote:push         # apply kfz migrations to shared project
pnpm secrets:push           # push KFZ_API_KEY etc. to edge functions
pnpm functions:deploy       # deploy kfz-* edge functions

pnpm data:local:seed:counts # local Docker only: list + tmp/kfz_stats.json counts
```

## Data refresh (Mac)

```bash
pnpm refresh-kfz-data       # scrape → data/kfz-list.json → upsert kfz.prefixes
```

Sync is **additive only**: new and changed prefixes are inserted/updated; prefixes
that drop off the official list stay in the database (they may still be on the road).
Counts and `queried_at` are not touched unless you run `pnpm data:local:seed:counts` (local) or `pnpm data:seed:counts` (whichever DB `.env.local` / `.env` points at).

## Count correction

```bash
pnpm data:fix-count -- KF 2
pnpm data:fix-count -- KF --decrement
```

## Local development

Local stack uses ports **54331** (API) / **54332** (DB) so it can run alongside flippy/hgv.
Reset/truncate is **local only** — guarded in scripts and SQL.

```bash
pnpm dev                    # local Supabase + edge functions + PWA (never prod)
pnpm db:local:start
pnpm db:local:reset         # guarded: local Docker only + seed from data/kfz-list.json
pnpm db:local:restore:fixtures
pnpm env:local              # write .env.local + web/.env.local + supabase/.env
pnpm data:local:seed        # local Docker only (refuses hosted Supabase URLs)
pnpm data:seed              # uses .env.local when present, else .env (may be remote)
pnpm test:integration       # local Supabase + edge functions only
```

Local dev points the PWA at **localhost** (`web/.env.local`). That DB starts with only test fixtures (KF, M) until seeded — `pnpm dev` and `pnpm db:local:reset` auto-seed from `data/kfz-list.json` when fewer than 100 prefixes are present.

`pnpm web:dev` uses `.env.local` when it exists (falls back to `.env` for prod builds).

`pnpm db:remote:reset` always fails (by design).

## PWA (iPhone)

The web app lives in `web/` — Vite + vanilla TS, iOS-first (standalone, safe areas, large tap targets).

```bash
pnpm assets:sync          # assets/ → web/public/icons/
pnpm web:dev              # sync + Vite dev server on :5173
pnpm web:build            # sync + production build → web/dist/
pnpm web:preview          # preview production build locally
```

Icon preview (after sync): open `web/public/icons/preview.html` in a browser.

**Install on iPhone**

1. Deploy `web/dist/` to static hosting (Cloudflare Pages, etc.) over HTTPS
2. Open the site in **Safari**
3. Share → **Add to Home Screen**

**Features**

- Text lookup + mic (Web Speech API, tap to speak)
- Always increments on successful lookup
- Processes Watch/server queue on open: Look up / Not now / Delete
- Offline: saves to local queue, syncs when back online
- Last 20 lookups in recent history
- API key from build env (`VITE_KFZ_API_KEY`) or one-time device setup

## API (edge functions)

All requests require header: `x-kfz-key: <KFZ_API_KEY>`

| Function | Method | Body | Purpose |
|---|---|---|---|
| `kfz-capture` | POST | `{ "prefix": "KF", "source": "watch" }` | Queue for later |
| `kfz-queue` | GET | — | List pending queue |
| `kfz-lookup` | POST | `{ "prefix": "KF" }` | Lookup + increment |
| `kfz-process` | POST | `{ "queue_id": "..." }` | Process queue item |
| `kfz-delete` | POST | `{ "queue_id": "..." }` | Drop queue item |
| `kfz-stats` | GET | — | Progress: found/total (count &gt; 0) |
| `kfz-search` | GET | `?q=KF` | Prefixes where code starts with query |

Base URL: `https://wchzccrcqlxgsftjbpgn.supabase.co/functions/v1/`

## Patterns copied from sibling repos

| From | What |
|---|---|
| **hgv** | Shared Supabase project, `kfz` schema isolation, `db:link` / `db:push`, schema-qualified SQL, nodenv |
| **flippy** | pnpm, `db:local:*` / `db:remote:*` scripts, fixture reset, RLS deny policies, `pnpm exec supabase` |

## Files

- `data/kfz-list.json` — scraped prefix reference data (source of truth for list refresh)
- `scripts/kfz.py` — regenerates `data/kfz-list.json`
- `assets/` — logo/icon sources (synced to PWA via `pnpm assets:sync`)
- `tmp/kfz_stats.json` — legacy sighting counts for one-time seed
