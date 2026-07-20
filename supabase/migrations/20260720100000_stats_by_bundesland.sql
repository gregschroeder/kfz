-- Per-Bundesland progress: prefixes seen at least once vs total in that state.
create or replace function kfz.stats_by_bundesland()
returns table (
  bundesland text,
  total bigint,
  found bigint,
  percent numeric
)
language sql
stable
security definer
set search_path = kfz
as $$
  select
    bundesland,
    count(*) as total,
    count(*) filter (where count > 0) as found,
    round(
      100.0 * count(*) filter (where count > 0) / nullif(count(*), 0),
      2
    ) as percent
  from kfz.prefixes
  group by bundesland
  order by percent desc, bundesland asc;
$$;

grant execute on function kfz.stats_by_bundesland() to service_role;
