create table if not exists public.intelligence_trend_snapshot_generations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  generation_started_at timestamptz not null,
  applied_at timestamptz not null default now(),
  snapshot_count integer not null default 0 check (snapshot_count >= 0),
  primary key (owner_id, period_start, period_end),
  check (period_start <= period_end)
);

alter table public.intelligence_trend_snapshot_generations enable row level security;

revoke all on table public.intelligence_trend_snapshot_generations
  from public, anon, authenticated;
grant all on table public.intelligence_trend_snapshot_generations
  to service_role;

create or replace function public.replace_intelligence_trend_snapshots(
  p_owner_id uuid,
  p_period_start date,
  p_period_end date,
  p_generation_started_at timestamptz,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_generation timestamptz;
  snapshot_count integer := 0;
  stale_deleted_count integer := 0;
begin
  if p_owner_id is null
    or p_period_start is null
    or p_period_end is null
    or p_generation_started_at is null
  then
    raise exception 'Trend replacement parameters cannot be null.';
  end if;

  if p_period_start > p_period_end then
    raise exception 'Trend period start must not be after period end.';
  end if;

  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Trend replacement rows must be a JSON array.';
  end if;

  insert into public.intelligence_trend_snapshot_generations (
    owner_id,
    period_start,
    period_end,
    generation_started_at,
    applied_at,
    snapshot_count
  )
  values (
    p_owner_id,
    p_period_start,
    p_period_end,
    '-infinity'::timestamptz,
    pg_catalog.clock_timestamp(),
    0
  )
  on conflict (owner_id, period_start, period_end) do nothing;

  select generation.generation_started_at
  into existing_generation
  from public.intelligence_trend_snapshot_generations as generation
  where generation.owner_id = p_owner_id
    and generation.period_start = p_period_start
    and generation.period_end = p_period_end
  for update;

  if existing_generation is not null
    and existing_generation > p_generation_started_at
  then
    select count(*)::integer
    into snapshot_count
    from public.intelligence_trend_snapshots as snapshot
    where snapshot.owner_id = p_owner_id
      and snapshot.period_start = p_period_start
      and snapshot.period_end = p_period_end;

    return pg_catalog.jsonb_build_object(
      'applied', false,
      'snapshot_count', snapshot_count,
      'stale_deleted_count', 0,
      'generation_started_at', existing_generation
    );
  end if;

  with incoming as (
    select *
    from pg_catalog.jsonb_to_recordset(p_rows) as row(
      trend_key text,
      trend_label text,
      domain text,
      document_count integer,
      cluster_count integer,
      event_count integer,
      independent_source_count integer,
      mention_rate numeric,
      event_rate numeric,
      momentum numeric,
      source_diversity numeric,
      persistence numeric,
      evidence_confidence numeric,
      trend_strength numeric,
      novelty boolean,
      metadata jsonb
    )
  )
  insert into public.intelligence_trend_snapshots (
    owner_id,
    trend_key,
    trend_label,
    domain,
    period_start,
    period_end,
    document_count,
    cluster_count,
    event_count,
    independent_source_count,
    mention_rate,
    event_rate,
    momentum,
    source_diversity,
    persistence,
    evidence_confidence,
    trend_strength,
    novelty,
    metadata,
    computed_at
  )
  select
    p_owner_id,
    incoming.trend_key,
    incoming.trend_label,
    incoming.domain,
    p_period_start,
    p_period_end,
    incoming.document_count,
    incoming.cluster_count,
    incoming.event_count,
    incoming.independent_source_count,
    incoming.mention_rate,
    incoming.event_rate,
    incoming.momentum,
    incoming.source_diversity,
    incoming.persistence,
    incoming.evidence_confidence,
    incoming.trend_strength,
    incoming.novelty,
    incoming.metadata,
    p_generation_started_at
  from incoming
  on conflict (owner_id, trend_key, period_start, period_end)
  do update set
    trend_label = excluded.trend_label,
    domain = excluded.domain,
    document_count = excluded.document_count,
    cluster_count = excluded.cluster_count,
    event_count = excluded.event_count,
    independent_source_count = excluded.independent_source_count,
    mention_rate = excluded.mention_rate,
    event_rate = excluded.event_rate,
    momentum = excluded.momentum,
    source_diversity = excluded.source_diversity,
    persistence = excluded.persistence,
    evidence_confidence = excluded.evidence_confidence,
    trend_strength = excluded.trend_strength,
    novelty = excluded.novelty,
    metadata = excluded.metadata,
    computed_at = excluded.computed_at;

  delete from public.intelligence_trend_snapshots as snapshot
  where snapshot.owner_id = p_owner_id
    and snapshot.period_start = p_period_start
    and snapshot.period_end = p_period_end
    and not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as incoming(trend_key text)
      where incoming.trend_key = snapshot.trend_key
    );
  get diagnostics stale_deleted_count = row_count;

  select count(*)::integer
  into snapshot_count
  from public.intelligence_trend_snapshots as snapshot
  where snapshot.owner_id = p_owner_id
    and snapshot.period_start = p_period_start
    and snapshot.period_end = p_period_end;

  insert into public.intelligence_trend_snapshot_generations (
    owner_id,
    period_start,
    period_end,
    generation_started_at,
    applied_at,
    snapshot_count
  )
  values (
    p_owner_id,
    p_period_start,
    p_period_end,
    p_generation_started_at,
    pg_catalog.clock_timestamp(),
    snapshot_count
  )
  on conflict (owner_id, period_start, period_end)
  do update set
    generation_started_at = excluded.generation_started_at,
    applied_at = excluded.applied_at,
    snapshot_count = excluded.snapshot_count;

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'snapshot_count', snapshot_count,
    'stale_deleted_count', stale_deleted_count,
    'generation_started_at', p_generation_started_at
  );
end;
$$;

revoke all on function public.replace_intelligence_trend_snapshots(
  uuid,
  date,
  date,
  timestamptz,
  jsonb
) from public, anon, authenticated;
grant execute on function public.replace_intelligence_trend_snapshots(
  uuid,
  date,
  date,
  timestamptz,
  jsonb
) to service_role;
