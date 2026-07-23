# KFZ brand assets (source of truth)

Edit the master PNGs here, then sync to the PWA:

```bash
pnpm assets:sync
```

| File | Use |
|---|---|
| `icon-master.png` | App icon (1024×1024) — favicons, PWA icons, home screen |
| `logo-plate-master.png` | Horizontal plate logo — header |
| `kzq-logo.svg` / `kzq-icon.svg` | KZQ (Kennzeichen Queue) shortcut brand → `pnpm shortcuts:assets` |
| `preview/` | Reference previews only (not deployed) |

Legacy `*.svg` files are unused; PNG masters are exported to `web/public/icons/`.

Generated outputs land in `web/public/icons/` (do not edit by hand).
