# shortcuts/

Apple Shortcuts as **source** in this repo, built into installable `.shortcut` files hosted on GitHub Pages.

## KZQ — Kennzeichen Queue (`kzq/`)

Watch-first capture of German plate prefixes (1–3 letters, including Ä/Ö/Ü). Queues via `kfz-capture`.

Dictate → **materialize into Spoken** (Text + Set Variable) → parse → menu **“Kennzeichen: KF”** with **Queue** / **Edit** → POST. Direct magic-var refs from Dictate often arrive empty on device; Spoken fixes that.

| File | Role |
|------|------|
| `definition.mjs` | Source of truth |
| `parse-spoken-prefix.mjs` | Parser algorithm (keep in sync with shortcut) |
| `KZQ.shortcut` | Signed installable (generated) |
| `KZQ.debug.shortcut` | Debug build with Show Result steps (generated, gitignored) |
| `KZQ.unsigned.shortcut` | Pre-sign plist (generated, gitignored) |

### Build (macOS)

```bash
pnpm shortcuts:build              # prod → KZQ.shortcut (+ Pages)
pnpm shortcuts:build -- --local   # local stack → KZQ.local.shortcut
pnpm shortcuts:build -- --debug   # prod + Show Result steps → KZQ.debug.shortcut
```

Local build needs Supabase running (`pnpm dev:local`). Import key: `local-dev-key`.

```bash
open shortcuts/kzq/KZQ.local.shortcut
```

### Debug on Watch (LAN install)

You don’t install onto the Watch from a URL. Phone downloads/imports → **Show on Apple Watch** → run on Watch.

```bash
pnpm shortcuts:build -- --debug
pnpm web:dev   # serves web/public/shortcuts/ on :5173 (host: true)
```

On the phone (same Wi‑Fi as the Mac), open:

```
http://<mac-lan-ip>:5173/shortcuts/KZQ.debug.shortcut
```

Import as **KZQ Debug**, enter the household API key, then on iPhone: Shortcuts → KZQ Debug → ⓘ → **Show on Apple Watch**.

On Watch, each major step shows a **Show Result** screen (tap to continue):

1. Dictate out — raw Dictate Text action output  
2. Spoken var — after Set Variable  
3. After strip Prefix — letters-only Prefix  
4. Branch: HAS Prefix | EMPTY Prefix  
5. POST Prefix — value about to be sent (and After Ask if empty branch)

Blank values render as `label: []`.

`--debug --local` points capture at the Mac’s LAN IP (not `127.0.0.1`) so the phone/Watch can reach local Supabase functions.

### Install (prod)

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
