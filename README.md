# kfz

German license plate (KFZ) lookup — PWA + Watch deferred capture.

Shares the Supabase Postgres project with [hgv](../hgv) (`wchzccrcqlxgsftjbpgn`). App data lives in the **`kfz`** schema (`hgv` uses `hgv.*`).

Every script that touches Supabase is prefixed **`local`** (Docker on `127.0.0.1`) or **`prod`** (hosted project). There are no ambiguous names.

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

## Script reference

| Script | Target | What it does |
|---|---|---|
| **Setup (neutral)** | | |
| `pnpm db:login` | — | Supabase CLI login |
| `pnpm db:init` | — | Create supabase/ scaffold |
| `pnpm db:migration:new` | — | New SQL migration file |
| **Prod** (hosted `wchzccrcqlxgsftjbpgn`, uses `.env`) | | |
| `pnpm db:prod:link` | prod | Link CLI to hosted project |
| `pnpm db:prod:push` | prod | Apply migrations |
| `pnpm db:prod:pull` | prod | Pull remote schema |
| `pnpm db:prod:dump` | prod | Schema dump → `tmp/` |
| `pnpm db:prod:dump:data` | prod | Data dump → `tmp/` |
| `pnpm db:prod:reset` | prod | **Always refuses** |
| `pnpm db:prod:config:push` | prod | Push `supabase/config.toml` |
| `pnpm db:prod:secrets:push` | prod | Push `KFZ_API_KEY` etc. to edge runtime |
| `pnpm prod:up` | prod | **Shortcut:** migrations + deploy functions |
| `pnpm functions:prod:deploy` | prod | Edge functions only |
| `pnpm data:prod:refresh` | prod | Scrape → `data/kfz-list.json` → upsert prefixes |
| `pnpm data:prod:seed` | prod | Upsert prefixes from `data/kfz-list.json` |
| `pnpm data:prod:seed:counts` | prod | Same + counts from `tmp/kfz_stats.json` |
| `pnpm data:prod:fix-count` | prod | Set/decrement one prefix count |
| `pnpm web:build` | prod | PWA build using `.env` → `web/dist/` |
| `pnpm pages:prod:setup` | prod | GitHub Pages + Actions secrets/vars via `gh` |
| **Local** (Docker `:54331`/`:54332`, uses `.env.local`) | | |
| `pnpm db:local:start` | local | Start Docker stack |
| `pnpm db:local:stop` | local | Stop Docker stack |
| `pnpm db:local:status` | local | Show local URLs/keys |
| `pnpm db:local:push` | local | Apply migrations to local DB |
| `pnpm db:local:reset` | local | Reset + seed from `data/kfz-list.json` |
| `pnpm db:local:reset:empty` | local | Reset, no seed |
| `pnpm db:local:restore:fixtures` | local | Test fixtures only |
| `pnpm db:local:dump` | local | Schema dump → `tmp/` |
| `pnpm db:local:dump:data` | local | Data dump → `tmp/` |
| `pnpm local:up` | local | **Shortcut:** migrations + refresh `.env.local` |
| `pnpm functions:local:deploy` | local | Edge functions only (if not using dev:local) |
| `pnpm env:local` | local | Write `.env.local`, `web/.env.local`, etc. |
| `pnpm data:local:seed` | local | Upsert prefixes locally |
| `pnpm data:local:seed:counts` | local | Same + legacy counts |
| `pnpm data:local:fix-count` | local | Fix one count locally |
| `pnpm dev:local` | local | Supabase + functions + PWA `:5173` |
| `pnpm web:dev` | local | PWA dev server |
| `pnpm test:integration` | local | API integration tests |
| **Other** | | |
| `pnpm assets:sync` | — | Icons → `web/public/` |
| `pnpm web:preview` | — | Preview built PWA |

Prod scripts print `→ prod Supabase (wchzccrcqlxgsftjbpgn)` and verify the linked project ref. Data scripts print `→ prod database (.env)` or `→ local database (.env.local)`.

## What to run when you change things

| You changed… | Local | Prod |
|---|---|---|
| **Edge function** (`supabase/functions/`) | Nothing extra if `pnpm dev:local` is running — **hot reload**. Otherwise restart `dev:local` or run `functions:local:deploy`. | `pnpm prod:up` or `pnpm functions:prod:deploy` |
| **SQL migration** (`supabase/migrations/`) | `pnpm local:up` or `pnpm db:local:push` | `pnpm prod:up` or `pnpm db:prod:push` |
| **PWA** (`web/`) | Auto reload via Vite while `dev:local` / `web:dev` runs | `pnpm web:build` then redeploy `web/dist/` to static host |
| **Prefix list / scrape** (`scripts/kfz.py`) | `pnpm data:local:seed` | `pnpm data:prod:refresh` |
| **Secrets** (`.env` keys for functions) | `pnpm env:local` | `pnpm db:prod:secrets:push` |

**Shortcut — “make prod up to date”** after code changes (migrations + functions):

```bash
pnpm prod:up
```

**Shortcut — “make local DB up to date”** after new migrations:

```bash
pnpm local:up
pnpm dev:local    # daily driver: DB + functions (hot reload) + PWA
```

`prod:up` does **not** rebuild the PWA, refresh prefix data, or push secrets — only schema + functions.

## First-time prod setup

```bash
cp .env.example .env          # fill in prod passwords/keys
pnpm install
python3 -m venv venv && venv/bin/pip install -r requirements.txt

pnpm db:login
pnpm db:prod:link
pnpm db:prod:push
pnpm db:prod:secrets:push
pnpm functions:prod:deploy

pnpm data:prod:seed:counts    # prefixes + legacy counts from tmp/kfz_stats.json
```

## Data refresh (Mac → prod)

```bash
pnpm data:prod:refresh        # scrape → data/kfz-list.json → upsert prod prefixes
```

Sync is **additive only**: new/changed prefixes are upserted; removed official codes stay in the DB.
Counts and `queried_at` are untouched unless you run `pnpm data:prod:seed:counts`.

## Count correction

```bash
pnpm data:prod:fix-count -- KF 2
pnpm data:prod:fix-count -- KF --decrement
pnpm data:local:fix-count -- KF 2
```

## Local development

Local stack uses ports **54331** (API) / **54332** (DB) so it can run alongside flippy/hgv.

```bash
pnpm dev:local                # or: db:local:start + functions:local:deploy + web:dev
pnpm db:local:reset
pnpm test:integration
```

`pnpm env:local` writes `.env.local` — prod scripts never read it.

## PWA (iPhone)

```bash
pnpm assets:sync
pnpm web:dev                  # local
pnpm web:build                # prod bundle → web/dist/
pnpm web:preview
```

**Install on iPhone:** deploy `web/dist/` over HTTPS → Safari → Add to Home Screen.

## Hosting (GitHub Pages + custom domain)

The repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.
On every push to `main`, it:

1. installs dependencies
2. writes a temporary prod `.env`
3. runs `pnpm web:build`
4. publishes `web/dist/` to **GitHub Pages**

### GitHub repo setup (CLI)

Requires [GitHub CLI](https://cli.github.com/) (`brew install gh && gh auth login`).

```bash
# Default domain: kfz.schroeder.org (reads KFZ_API_KEY / URLs from .env)
pnpm pages:prod:setup

# Override domain if needed:
pnpm pages:prod:setup -- --domain other.example.com
```

That script:

1. sets Pages **source = GitHub Actions** (`build_type=workflow`)
2. sets Actions **secret** `KFZ_API_KEY`
3. sets Actions **variables** `SUPABASE_URL`, `VITE_FUNCTIONS_URL`, `PAGES_CNAME`
4. sets the Pages **custom domain** (default `kfz.schroeder.org`)
5. prints the Namecheap DNS record to add

### Namecheap DNS (manual)

Still one manual step — Namecheap isn’t configured by this repo:

- **Type**: `CNAME`
- **Host**: `kfz`
- **Value**: `gregschroeder.github.io`
- **TTL**: automatic/default

After DNS resolves, re-run `pnpm pages:prod:setup` if HTTPS wasn’t enforced yet. GitHub Pages provisions the certificate automatically. Site: `https://kfz.schroeder.org`.

### Deploy flow

After backend changes:

```bash
pnpm prod:up
```

After frontend changes:

```bash
git push origin main
```

GitHub Actions will rebuild and publish the PWA.

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

## Files

- `data/kfz-list.json` — scraped prefix reference data
- `scripts/kfz.py` — regenerates `data/kfz-list.json`
- `assets/` — logo/icon sources
- `tmp/kfz_stats.json` — legacy sighting counts for one-time prod seed
