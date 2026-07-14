-- Seed the immutable generation registry from the one-generation signal
-- schema. The archive is aggregated once into a temporary narrow relation so
-- validation and publication do not rescan the wide daily table.

create table if not exists public.intelligence_signal_generations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  metric_version text not null check (btrim(metric_version) <> ''),
  refresh_id uuid not null,
  start_date date not null,
  complete_through date not null,
  generation_started_at timestamptz not null,
  status text not null default 'staging' check (status in (
    'staging', 'active', 'retired'
  )),
  promote boolean not null,
  final_ordinal integer check (final_ordinal is null or final_ordinal >= 0),
  signal_count bigint not null default 0 check (signal_count >= 0),
  daily_row_count bigint not null default 0 check (daily_row_count >= 0),
  event_dedup_generation_id uuid,
  story_dedup_generation_id uuid,
  completed_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  pruned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, metric_version, refresh_id),
  unique (owner_id, refresh_id),
  check (start_date <= complete_through)
);

create unique index if not exists intelligence_signal_generations_one_active_idx
  on public.intelligence_signal_generations (owner_id, metric_version)
  where status = 'active';

create index if not exists intelligence_signal_generations_recent_idx
  on public.intelligence_signal_generations (
    owner_id,
    metric_version,
    completed_at desc,
    generation_started_at desc
  );

create table if not exists public.intelligence_signal_active_generations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  metric_version text not null check (btrim(metric_version) <> ''),
  refresh_id uuid not null,
  activated_at timestamptz not null default now(),
  primary key (owner_id, metric_version),
  foreign key (owner_id, metric_version, refresh_id)
    references public.intelligence_signal_generations (
      owner_id,
      metric_version,
      refresh_id
    )
    on delete restrict
);

alter table public.intelligence_signal_generations enable row level security;
alter table public.intelligence_signal_active_generations enable row level security;

revoke all on table public.intelligence_signal_generations
  from public, anon, authenticated;
revoke all on table public.intelligence_signal_active_generations
  from public, anon, authenticated;
grant all on table public.intelligence_signal_generations to service_role;
grant all on table public.intelligence_signal_active_generations to service_role;

create temporary table intelligence_legacy_signal_generation_seed
on commit drop
as
with daily_generation as materialized (
  select
    daily.owner_id,
    daily.metric_version,
    daily.refresh_id,
    min(daily.signal_date) as start_date,
    max(daily.signal_date) as complete_through,
    min(daily.generation_started_at) as generation_started_at,
    count(distinct daily.signal_key)::bigint as signal_count,
    count(*)::bigint as daily_row_count,
    count(distinct nullif(
      daily.metadata ->> 'event_dedup_generation_id',
      ''
    ))::integer as event_generation_count,
    max(nullif(
      daily.metadata ->> 'event_dedup_generation_id',
      ''
    )) as event_generation_text,
    count(distinct nullif(
      daily.metadata ->> 'story_dedup_generation_id',
      ''
    ))::integer as story_generation_count,
    max(nullif(
      daily.metadata ->> 'story_dedup_generation_id',
      ''
    )) as story_generation_text
  from public.intelligence_signal_daily daily
  group by daily.owner_id, daily.metric_version, daily.refresh_id
), total_generation as materialized (
  select
    total.owner_id,
    total.metric_version,
    total.refresh_id,
    min(total.signal_date) as start_date,
    max(total.signal_date) as complete_through,
    min(total.generation_started_at) as generation_started_at
  from public.intelligence_signal_daily_totals total
  group by total.owner_id, total.metric_version, total.refresh_id
)
select
  coalesce(daily.owner_id, total.owner_id) as owner_id,
  coalesce(daily.metric_version, total.metric_version) as metric_version,
  coalesce(daily.refresh_id, total.refresh_id) as refresh_id,
  least(
    coalesce(daily.start_date, total.start_date),
    coalesce(total.start_date, daily.start_date)
  ) as start_date,
  greatest(
    coalesce(daily.complete_through, total.complete_through),
    coalesce(total.complete_through, daily.complete_through)
  ) as complete_through,
  least(
    coalesce(daily.generation_started_at, total.generation_started_at),
    coalesce(total.generation_started_at, daily.generation_started_at)
  ) as generation_started_at,
  coalesce(daily.signal_count, 0)::bigint as signal_count,
  coalesce(daily.daily_row_count, 0)::bigint as daily_row_count,
  coalesce(daily.event_generation_count, 0)::integer
    as event_generation_count,
  daily.event_generation_text,
  coalesce(daily.story_generation_count, 0)::integer
    as story_generation_count,
  daily.story_generation_text
from daily_generation daily
full join total_generation total
  on total.owner_id = daily.owner_id
 and total.metric_version = daily.metric_version
 and total.refresh_id = daily.refresh_id;

do $$
begin
  if exists (
    select 1
    from intelligence_legacy_signal_generation_seed seed
    where seed.event_generation_count > 1
      or seed.story_generation_count > 1
      or (
        seed.event_generation_text is not null
        and seed.event_generation_text !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      or (
        seed.story_generation_text is not null
        and seed.story_generation_text !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
  ) then
    raise exception 'Legacy signal rows disagree on their pinned dedup generations.';
  end if;
end
$$;

insert into public.intelligence_signal_generations (
  owner_id,
  metric_version,
  refresh_id,
  start_date,
  complete_through,
  generation_started_at,
  status,
  promote,
  signal_count,
  daily_row_count,
  event_dedup_generation_id,
  story_dedup_generation_id,
  completed_at,
  retired_at
)
select
  seed.owner_id,
  seed.metric_version,
  seed.refresh_id,
  seed.start_date,
  seed.complete_through,
  seed.generation_started_at,
  'retired',
  false,
  seed.signal_count,
  seed.daily_row_count,
  seed.event_generation_text::uuid,
  seed.story_generation_text::uuid,
  seed.generation_started_at,
  pg_catalog.now()
from intelligence_legacy_signal_generation_seed seed
on conflict (owner_id, metric_version, refresh_id) do nothing;

-- Pick at most one completed, non-validation run for each owner and metric.
with run_identity as materialized (
  select
    run.owner_id,
    run.completed_at,
    run.created_at,
    coalesce(
      nullif(run.checkpoint_after ->> 'refresh_id', ''),
      nullif(run.checkpoint_after ->> 'signal_refresh_id', ''),
      nullif(run.checkpoint_after -> 'signal_continuation' ->> 'refreshId', ''),
      nullif(run.checkpoint_after -> 'signals' ->> 'refreshId', ''),
      nullif(run.checkpoint_after -> 'result' -> 'signals' ->> 'refreshId', '')
    ) as refresh_id_text,
    coalesce(
      nullif(run.checkpoint_after ->> 'metric_version', ''),
      nullif(run.checkpoint_after ->> 'metricVersion', ''),
      nullif(run.checkpoint_after -> 'signals' ->> 'metricVersion', ''),
      nullif(run.checkpoint_after -> 'result' -> 'signals' ->> 'metricVersion', '')
    ) as metric_version,
    coalesce(
      nullif(run.checkpoint_after -> 'signal_continuation' ->> 'startDate', ''),
      nullif(run.checkpoint_after -> 'signals' ->> 'startDate', ''),
      nullif(run.checkpoint_after -> 'result' -> 'signals' ->> 'startDate', '')
    ) as start_date_text,
    coalesce(
      nullif(run.checkpoint_after ->> 'complete_through', ''),
      nullif(run.checkpoint_after ->> 'signal_complete_through', ''),
      nullif(run.checkpoint_after -> 'signal_continuation' ->> 'completeThrough', ''),
      nullif(run.checkpoint_after -> 'signals' ->> 'completeThrough', ''),
      nullif(run.checkpoint_after -> 'result' -> 'signals' ->> 'completeThrough', '')
    ) as complete_through_text
  from public.intelligence_runs run
  where run.status = 'completed'
    and run.checkpoint_after ->> 'validation_mode'
      is distinct from 'cloned_backfill_window'
    and (
      run.checkpoint_after ->> 'phase' = 'complete'
      or (
        run.checkpoint_after ? 'refresh_id'
        and run.checkpoint_after ? 'complete_through'
      )
    )
), valid_identity as materialized (
  select
    identity.owner_id,
    identity.metric_version,
    identity.refresh_id_text::uuid as refresh_id,
    identity.completed_at,
    identity.created_at,
    case
      when identity.start_date_text ~ '^\d{4}-\d{2}-\d{2}$'
        then identity.start_date_text::date
      else null
    end as declared_start_date,
    case
      when identity.complete_through_text ~ '^\d{4}-\d{2}-\d{2}$'
        then identity.complete_through_text::date
      else null
    end as declared_complete_through
  from run_identity identity
  where identity.metric_version is not null
    and identity.refresh_id_text ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and (
      identity.start_date_text is null
      or identity.start_date_text ~ '^\d{4}-\d{2}-\d{2}$'
    )
    and (
      identity.complete_through_text is null
      or identity.complete_through_text ~ '^\d{4}-\d{2}-\d{2}$'
    )
), candidate as materialized (
  select
    generation.owner_id,
    generation.metric_version,
    generation.refresh_id,
    coalesce(identity.declared_start_date, generation.start_date)
      as declared_start_date,
    coalesce(identity.declared_complete_through, generation.complete_through)
      as declared_complete_through,
    coalesce(identity.completed_at, identity.created_at, pg_catalog.now())
      as activated_at,
    row_number() over (
      partition by generation.owner_id, generation.metric_version
      order by
        identity.completed_at desc nulls last,
        identity.created_at desc,
        generation.generation_started_at desc,
        generation.refresh_id
    ) as candidate_rank
  from valid_identity identity
  join public.intelligence_signal_generations generation
    on generation.owner_id = identity.owner_id
   and generation.metric_version = identity.metric_version
   and generation.refresh_id = identity.refresh_id
  where coalesce(identity.declared_start_date, generation.start_date)
      <= generation.start_date
    and coalesce(
      identity.declared_complete_through,
      generation.complete_through
    ) >= generation.complete_through
    and not exists (
      select 1
      from public.intelligence_signal_daily mixed_daily
      where mixed_daily.owner_id = generation.owner_id
        and mixed_daily.metric_version = generation.metric_version
        and mixed_daily.signal_date between
          coalesce(identity.declared_start_date, generation.start_date)
          and coalesce(
            identity.declared_complete_through,
            generation.complete_through
          )
        and mixed_daily.refresh_id <> generation.refresh_id
    )
    and not exists (
      select 1
      from public.intelligence_signal_daily_totals mixed_total
      where mixed_total.owner_id = generation.owner_id
        and mixed_total.metric_version = generation.metric_version
        and mixed_total.signal_date between
          coalesce(identity.declared_start_date, generation.start_date)
          and coalesce(
            identity.declared_complete_through,
            generation.complete_through
          )
        and mixed_total.refresh_id <> generation.refresh_id
    )
), selected as materialized (
  select candidate.*
  from candidate
  where candidate.candidate_rank = 1
), updated_generation as (
  update public.intelligence_signal_generations generation
  set
    start_date = selected.declared_start_date,
    complete_through = selected.declared_complete_through,
    completed_at = selected.activated_at,
    updated_at = pg_catalog.now()
  from selected
  where generation.owner_id = selected.owner_id
    and generation.metric_version = selected.metric_version
    and generation.refresh_id = selected.refresh_id
  returning
    generation.owner_id,
    generation.metric_version,
    generation.refresh_id,
    selected.activated_at
)
insert into public.intelligence_signal_active_generations (
  owner_id,
  metric_version,
  refresh_id,
  activated_at
)
select
  updated_generation.owner_id,
  updated_generation.metric_version,
  updated_generation.refresh_id,
  updated_generation.activated_at
from updated_generation
on conflict (owner_id, metric_version) do nothing;

update public.intelligence_signal_generations generation
set
  status = 'active',
  promote = true,
  activated_at = active.activated_at,
  retired_at = null,
  updated_at = pg_catalog.now()
from public.intelligence_signal_active_generations active
where active.owner_id = generation.owner_id
  and active.metric_version = generation.metric_version
  and active.refresh_id = generation.refresh_id;

do $$
begin
  if exists (
    select 1
    from public.intelligence_signal_generations generation
    where not exists (
      select 1
      from public.intelligence_signal_active_generations active
      where active.owner_id = generation.owner_id
        and active.metric_version = generation.metric_version
    )
  ) then
    raise exception 'No safe completed run could seed an active signal generation.';
  end if;
end
$$;
