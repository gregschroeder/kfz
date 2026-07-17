# KFZ test fixtures

SQL fixtures for the local Supabase stack (`pnpm db:local:reset` or `pnpm db:local:restore:fixtures`).

**Local/dev only.** `reset-kfz-data.sql` refuses to run unless `app.kfz_allow_reset=true` (set only by guarded scripts). Direct `psql` against prod will fail.

| File | Purpose |
|---|---|
| `reset-kfz-data.sql` | Truncate `kfz.queue` and `kfz.prefixes` |
| `seed-minimal.sql` | Insert KF + M rows for fast integration tests |

After reset, load prefix data with:

```bash
pnpm data:seed
# or with historical counts:
pnpm data:seed:counts
# or minimal rows only (tests):
docker exec -i supabase_db_kfz psql -U postgres -d postgres < test/fixtures/seed-minimal.sql
```

`data:seed` / `refresh-kfz-data` never delete prefixes — legacy codes stay in the DB.
