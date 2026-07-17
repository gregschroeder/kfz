-- Prefix search for PWA startsWith filter.
create or replace function kfz.search_prefixes(p_query text, p_limit int default 50)
returns setof kfz.prefixes
language sql
stable
security definer
set search_path = kfz
as $$
  select *
  from kfz.prefixes
  where code like upper(trim(p_query)) || '%'
  order by code
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

grant execute on function kfz.search_prefixes(text, int) to service_role;
