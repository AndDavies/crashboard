-- Preserve one corpus denominator per measurement day independently of signal
-- support. A day with eligible coverage and zero retained signals must still
-- reduce weekly share-of-coverage rather than silently disappearing.
create table if not exists public.intelligence_signal_daily_totals (
  owner_id uuid not null references auth.users(id) on delete cascade,
  metric_version text not null check (btrim(metric_version) <> ''),
  signal_date date not null,
  eligible_items integer not null check (eligible_items >= 0),
  eligible_tokens bigint not null check (eligible_tokens >= 0),
  refresh_id uuid not null,
  generation_started_at timestamptz not null,
  computed_at timestamptz not null default now(),
  primary key (owner_id, metric_version, signal_date)
);

alter table public.intelligence_signal_daily_totals enable row level security;
revoke all on table public.intelligence_signal_daily_totals
  from public, anon, authenticated;
grant all on table public.intelligence_signal_daily_totals to service_role;

drop trigger if exists keep_newer_intelligence_signal_daily_totals_generation
  on public.intelligence_signal_daily_totals;
create trigger keep_newer_intelligence_signal_daily_totals_generation
before update on public.intelligence_signal_daily_totals
for each row execute function public.keep_newer_intelligence_signal_generation();

create or replace function public.get_intelligence_signal_daily_totals(
  query_owner uuid,
  query_metric_version text,
  query_start date,
  query_end date
)
returns table (
  signal_date date,
  eligible_items integer,
  eligible_tokens bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with persisted as materialized (
    select
      total.signal_date,
      total.eligible_items,
      total.eligible_tokens
    from public.intelligence_signal_daily_totals total
    where total.owner_id = query_owner
      and total.metric_version = query_metric_version
      and total.signal_date between query_start and query_end
  ),
  legacy as (
    select
      daily.signal_date,
      max(daily.eligible_items)::integer as eligible_items,
      max(daily.eligible_tokens)::bigint as eligible_tokens
    from public.intelligence_signal_daily daily
    where daily.owner_id = query_owner
      and daily.metric_version = query_metric_version
      and daily.signal_date between query_start and query_end
      and not exists (
        select 1
        from persisted
        where persisted.signal_date = daily.signal_date
      )
    group by daily.signal_date
  )
  select persisted.signal_date, persisted.eligible_items, persisted.eligible_tokens
  from persisted
  union all
  select legacy.signal_date, legacy.eligible_items, legacy.eligible_tokens
  from legacy
  order by 1;
$$;

revoke all on function public.get_intelligence_signal_daily_totals(uuid, text, date, date)
  from public, anon, authenticated;
grant execute on function public.get_intelligence_signal_daily_totals(uuid, text, date, date)
  to service_role;
