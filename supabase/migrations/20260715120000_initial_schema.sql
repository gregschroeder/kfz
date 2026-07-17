-- KFZ schema on shared Supabase project (hgv uses hgv.* on the same database).

create schema if not exists kfz;

create table if not exists kfz.prefixes (
  code text primary key,
  ursprung text not null,
  landkreis text not null,
  bundesland text not null,
  count int not null default 0 check (count >= 0),
  queried_at timestamptz
);

comment on table kfz.prefixes is 'Official KFZ prefix list and household sighting counts';
comment on column kfz.prefixes.ursprung is 'Herleitung / origin spelling with capitals';
comment on column kfz.prefixes.queried_at is 'Timestamp of most recent successful lookup';

create table if not exists kfz.queue (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  source text not null check (source in ('watch', 'phone')),
  status text not null default 'pending' check (status in ('pending', 'done', 'deleted')),
  created_at timestamptz not null default now()
);

comment on table kfz.queue is 'Deferred captures from Watch or offline phone';

create index if not exists queue_pending_created_idx
  on kfz.queue (created_at)
  where status = 'pending';

-- No duplicate pending prefixes in the queue.
create unique index if not exists queue_pending_prefix_uidx
  on kfz.queue (upper(prefix))
  where status = 'pending';

-- Direct Postgres access (Mac scripts), same pattern as hgv.
grant usage on schema kfz to postgres;
grant select, insert, update, delete on kfz.prefixes to postgres;
grant select, insert, update, delete on kfz.queue to postgres;
