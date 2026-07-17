-- Progress: prefixes seen at least once vs total in database.
create or replace function kfz.stats()
returns table (found bigint, total bigint)
language sql
stable
security definer
set search_path = kfz
as $$
  select
    count(*) filter (where count > 0) as found,
    count(*) as total
  from kfz.prefixes;
$$;

grant execute on function kfz.stats() to service_role;
