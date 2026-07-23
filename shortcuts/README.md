# shortcuts/

Apple Shortcuts as **source** in this repo, built into installable `.shortcut` files hosted on GitHub Pages.

## KZQ — Kennzeichen Queue (`kzq/`)

Watch-first capture of German plate prefixes (1–3 letters, including Ä/Ö/Ü). Queues via `kfz-capture`.

| File | Role |
|------|------|
| `definition.mjs` | Source of truth |
| `KZQ.shortcut` | Signed installable (generated) |
| `KZQ.unsigned.shortcut` | Pre-sign plist (generated, gitignored) |

### Build (macOS)

```bash
pnpm shortcuts:build              # prod → KZQ.shortcut (+ Pages)
pnpm shortcuts:build -- --local   # local stack → KZQ.local.shortcut
```

Local build needs Supabase running (`pnpm dev:local`). Import key: `local-dev-key`.

```bash
open shortcuts/kzq/KZQ.local.shortcut
```

### Install

After deploy: **[https://kfz.schroeder.org/shortcuts/](https://kfz.schroeder.org/shortcuts/)**

**Reliable:** open/download the file directly:

```
https://kfz.schroeder.org/shortcuts/KZQ.shortcut
```

**Deep link** (often fails on iOS for self-hosted files — “URL invalid”; do not encode the `&`):

```
shortcuts://import-shortcut?url=https%3A%2F%2Fkfz.schroeder.org%2Fshortcuts%2FKZQ.shortcut&name=KZQ
```

Import asks for the **household KFZ API key** once (same key as the PWA).
