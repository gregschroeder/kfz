-- Prefix list for one Bundesland (stats drill-down).
create or replace function kfz.list_prefixes_by_bundesland(p_bundesland text)
returns setof kfz.prefixes
language sql
stable
security definer
set search_path = kfz
as $$
  select *
  from kfz.prefixes
  where bundesland = trim(p_bundesland)
  order by code;
$$;

grant execute on function kfz.list_prefixes_by_bundesland(text) to service_role;
