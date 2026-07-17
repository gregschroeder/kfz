-- Minimal prefix rows for fast local integration tests.
insert into kfz.prefixes (code, ursprung, landkreis, bundesland, count)
values
  ('KF', 'KauFbeuren', 'Ostallgäu', 'Bayern', 0),
  ('M', 'München', 'München', 'Bayern', 0)
on conflict (code) do update set
  ursprung = excluded.ursprung,
  landkreis = excluded.landkreis,
  bundesland = excluded.bundesland;
