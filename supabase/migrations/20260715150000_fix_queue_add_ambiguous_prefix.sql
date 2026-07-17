-- Fix queue_add: output column "prefix" shadowed table column in WHERE/assignments.
create or replace function kfz.queue_add(p_prefix text, p_source text default 'phone')
returns table (
  id uuid,
  prefix text,
  source text,
  status text,
  created_at timestamptz,
  duplicate boolean
)
language plpgsql
security definer
set search_path = kfz
as $$
declare
  v_code text := upper(trim(p_prefix));
  v_existing kfz.queue;
  v_new kfz.queue;
begin
  if v_code = '' then
    raise exception 'prefix required' using errcode = '22023';
  end if;

  if p_source not in ('watch', 'phone') then
    raise exception 'invalid source: %', p_source using errcode = '22023';
  end if;

  select q.*
  into v_existing
  from kfz.queue q
  where upper(q.prefix) = v_code
    and q.status = 'pending'
  limit 1;

  if found then
    id := v_existing.id;
    prefix := v_existing.prefix;
    source := v_existing.source;
    status := v_existing.status;
    created_at := v_existing.created_at;
    duplicate := true;
    return next;
    return;
  end if;

  insert into kfz.queue (prefix, source, status)
  values (v_code, p_source, 'pending')
  returning * into v_new;

  id := v_new.id;
  prefix := v_new.prefix;
  source := v_new.source;
  status := v_new.status;
  created_at := v_new.created_at;
  duplicate := false;
  return next;
end;
$$;
