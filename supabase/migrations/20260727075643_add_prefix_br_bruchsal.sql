-- Reintroduced Altkennzeichen BR (Bruchsal), issued again in Landkreis Karlsruhe
-- since 2025-02-03 as an optional alternative to KA.
-- Historical household count was already present in import/refresh migrations
-- but had no effect without a prefixes row.

insert into kfz.prefixes (code, ursprung, landkreis, bundesland, count, queried_at)
values (
  'BR',
  'BRuchsal',
  'Landkreis Karlsruhe',
  'Baden-Württemberg',
  3,
  null
)
on conflict (code) do update set
  ursprung = excluded.ursprung,
  landkreis = excluded.landkreis,
  bundesland = excluded.bundesland,
  count = greatest(kfz.prefixes.count, excluded.count);
