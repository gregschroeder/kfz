# Project notes

## Supabase: explicit grants on new tables

Since 2026-10-30, Supabase no longer auto-grants Data API access to new tables in the `public` schema. Any migration that creates a table in `public` must grant access in the same migration, otherwise supabase-js / PostgREST / GraphQL return "permission denied". This also applies to `supabase db reset`, preview branches, and new projects, since they replay migrations.

Tables that already exist in the hosted project keep their current grants. Catch: a fresh rebuild (`supabase db reset`, a preview branch, a new project) replays the old `create table` migrations too, and those tables won't get grants either unless a migration grants them.

```sql
grant select on public.your_table to anon;
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;
```

Only grant `anon` / `authenticated` what the table actually needs. RLS policies still apply on top of these grants.
