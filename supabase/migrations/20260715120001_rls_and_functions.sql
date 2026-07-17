-- RLS: deny anon/authenticated on kfz tables (Flippy pattern).
-- App access via service_role (edge functions) and postgres (Mac scripts).

alter table kfz.prefixes enable row level security;
alter table kfz.queue enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['prefixes', 'queue']
  loop
    execute format(
      'drop policy if exists "deny_anon" on kfz.%I;
       drop policy if exists "deny_authenticated" on kfz.%I;
       create policy "deny_anon"
         on kfz.%I
         for all
         to anon
         using (false)
         with check (false);
       create policy "deny_authenticated"
         on kfz.%I
         for all
         to authenticated
         using (false)
         with check (false);',
      t, t, t, t
    );
  end loop;
end;
$$;

grant select, insert, update, delete on table kfz.prefixes to service_role;
grant select, insert, update, delete on table kfz.queue to service_role;
grant usage on schema kfz to service_role;

-- Atomic lookup: increment count and set queried_at.
create or replace function kfz.lookup_and_increment(p_prefix text)
returns kfz.prefixes
language plpgsql
security definer
set search_path = kfz
as $$
declare
  v_code text := upper(trim(p_prefix));
  v_row kfz.prefixes;
begin
  if v_code = '' then
    raise exception 'prefix required' using errcode = '22023';
  end if;

  update kfz.prefixes
  set
    count = count + 1,
    queried_at = now()
  where code = v_code
  returning * into v_row;

  if not found then
    raise exception 'unknown prefix: %', v_code using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- Add to queue; skip if same prefix already pending.
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

  select *
  into v_existing
  from kfz.queue
  where upper(prefix) = v_code
    and status = 'pending'
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

-- Process one queue item: lookup + increment + mark done.
create or replace function kfz.queue_process(p_queue_id uuid)
returns kfz.prefixes
language plpgsql
security definer
set search_path = kfz
as $$
declare
  v_item kfz.queue;
  v_row kfz.prefixes;
begin
  select *
  into v_item
  from kfz.queue
  where id = p_queue_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'queue item not found or not pending: %', p_queue_id using errcode = 'P0002';
  end if;

  v_row := kfz.lookup_and_increment(v_item.prefix);

  update kfz.queue
  set status = 'done'
  where id = p_queue_id;

  return v_row;
end;
$$;

-- Delete (drop) one pending queue item without incrementing.
create or replace function kfz.queue_delete(p_queue_id uuid)
returns void
language plpgsql
security definer
set search_path = kfz
as $$
begin
  update kfz.queue
  set status = 'deleted'
  where id = p_queue_id
    and status = 'pending';

  if not found then
    raise exception 'queue item not found or not pending: %', p_queue_id using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function kfz.lookup_and_increment(text) to service_role;
grant execute on function kfz.queue_add(text, text) to service_role;
grant execute on function kfz.queue_process(uuid) to service_role;
grant execute on function kfz.queue_delete(uuid) to service_role;
