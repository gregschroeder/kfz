# KFZ test fixtures

SQL fixtures for the local Supabase stack (`pnpm db:local:reset` or `pnpm db:local:restore:fixtures`).

**Local/dev only.** `reset-kfz-data.sql` refuses to run unless `app.kfz_allow_reset=true` (set only by guarded scripts). Direct `psql` against prod will fail.

| File | Purpose |
|---|---|
| `reset-kfz-data.sql` | Truncate `kfz.queue` and `kfz.prefixes` |
| `seed-minimal.sql` | Insert KF + M rows for fast integration tests |

After reset, load prefix data with:

```bash
pnpm data:local:seed
pnpm data:local:seed:counts
```

`data:prod:*` never delete prefixes — legacy codes stay in the DB.
