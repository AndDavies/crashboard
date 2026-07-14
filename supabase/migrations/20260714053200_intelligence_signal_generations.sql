-- Install immutable generation indexes and runtime functions after the
-- bounded legacy seed and generation-scoped constraints are committed.
create index if not exists intelligence_signal_daily_active_window_idx
  on public.intelligence_signal_daily (
    owner_id,
    metric_version,
    refresh_id,
    signal_date desc,
    signal_kind,
    direction,
    hidden_rank_score desc
  );

create index if not exists intelligence_signal_daily_generation_key_idx
  on public.intelligence_signal_daily (
    owner_id,
    metric_version,
    refresh_id,
    signal_key,
    signal_date desc
  );

-- Canonical signal writes are service operations. Authenticated users retain
-- their owner-scoped SELECT policy, but can no longer bypass generation RPCs.
revoke insert, update, delete on table public.intelligence_signal_daily
  from public, anon, authenticated;
drop policy if exists "Owners can insert intelligence_signal_daily"
  on public.intelligence_signal_daily;
drop policy if exists "Owners can update intelligence_signal_daily"
  on public.intelligence_signal_daily;
drop policy if exists "Owners can delete intelligence_signal_daily"
  on public.intelligence_signal_daily;

-- Keep the pre-existing denominator helper safe under multi-generation
-- storage. Both persisted and legacy fallback rows are scoped to the single
-- active pointer.
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
  with active as materialized (
    select pointer.refresh_id
    from public.intelligence_signal_active_generations pointer
    where pointer.owner_id = query_owner
      and pointer.metric_version = query_metric_version
  ), persisted as materialized (
    select
      total.signal_date,
      total.eligible_items,
      total.eligible_tokens
    from public.intelligence_signal_daily_totals total
    join active on active.refresh_id = total.refresh_id
    where total.owner_id = query_owner
      and total.metric_version = query_metric_version
      and total.signal_date between query_start and query_end
  ), legacy as (
    select
      daily.signal_date,
      max(daily.eligible_items)::integer as eligible_items,
      max(daily.eligible_tokens)::bigint as eligible_tokens
    from public.intelligence_signal_daily daily
    join active on active.refresh_id = daily.refresh_id
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

revoke all on function public.get_intelligence_signal_daily_totals(
  uuid, text, date, date
) from public, anon, authenticated;
grant execute on function public.get_intelligence_signal_daily_totals(
  uuid, text, date, date
) to service_role;

create or replace function public.begin_intelligence_signal_generation(
  query_owner uuid,
  query_refresh_id uuid,
  query_metric_version text,
  query_start date,
  query_end date,
  query_generation_started_at timestamptz,
  query_promote boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generation public.intelligence_signal_generations%rowtype;
begin
  if query_owner is null
    or query_refresh_id is null
    or query_metric_version is null
    or btrim(query_metric_version) = ''
    or query_start is null
    or query_end is null
    or query_generation_started_at is null
    or query_promote is null
  then
    raise exception 'Signal generation identity is incomplete.';
  end if;
  if query_start > query_end then
    raise exception 'Signal generation start date must not follow its complete-through date.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      query_owner::text || ':' || query_metric_version || ':signal-generation',
      0
    )
  );

  insert into public.intelligence_signal_generations (
    owner_id,
    metric_version,
    refresh_id,
    start_date,
    complete_through,
    generation_started_at,
    status,
    promote
  ) values (
    query_owner,
    query_metric_version,
    query_refresh_id,
    query_start,
    query_end,
    query_generation_started_at,
    'staging',
    query_promote
  )
  on conflict (owner_id, metric_version, refresh_id) do nothing;

  select existing.*
  into generation
  from public.intelligence_signal_generations existing
  where existing.owner_id = query_owner
    and existing.metric_version = query_metric_version
    and existing.refresh_id = query_refresh_id
  for update;

  if generation.owner_id is null then
    raise exception 'Signal generation initialization did not persist its identity.';
  end if;
  if generation.start_date is distinct from query_start
    or generation.complete_through is distinct from query_end
    or generation.generation_started_at is distinct from
      query_generation_started_at
    or generation.promote is distinct from query_promote
  then
    raise exception 'Signal generation identity conflicts with an existing immutable generation.';
  end if;

  return pg_catalog.jsonb_build_object(
    'refresh_id', generation.refresh_id,
    'metric_version', generation.metric_version,
    'start_date', generation.start_date,
    'complete_through', generation.complete_through,
    'generation_started_at', generation.generation_started_at,
    'status', generation.status,
    'promote', generation.promote,
    'signal_count', generation.signal_count,
    'daily_row_count', generation.daily_row_count,
    'event_dedup_generation_id', generation.event_dedup_generation_id,
    'story_dedup_generation_id', generation.story_dedup_generation_id,
    'activated_at', generation.activated_at,
    'retired_at', generation.retired_at
  );
end;
$$;

create or replace function public.complete_intelligence_signal_generation(
  query_owner uuid,
  query_refresh_id uuid,
  query_metric_version text,
  query_start date,
  query_end date,
  query_generation_started_at timestamptz,
  query_final_ordinal integer,
  query_event_generation_id uuid,
  query_story_generation_id uuid,
  query_promote boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generation public.intelligence_signal_generations%rowtype;
  support_segment_count bigint := 0;
  unprocessed_segment_count bigint := 0;
  mismatched_segment_count bigint := 0;
  support_term_count bigint := 0;
  ordinal_count bigint := 0;
  distinct_ordinal_count bigint := 0;
  minimum_ordinal integer := 0;
  maximum_ordinal integer := 0;
  mismatched_term_count bigint := 0;
  stored_signal_count bigint := 0;
  stored_daily_row_count bigint := 0;
  stored_total_count bigint := 0;
  activated_time timestamptz;
begin
  if query_owner is null
    or query_refresh_id is null
    or query_metric_version is null
    or btrim(query_metric_version) = ''
    or query_start is null
    or query_end is null
    or query_generation_started_at is null
    or query_final_ordinal is null
    or query_final_ordinal < 0
    or query_promote is null
  then
    raise exception 'Signal generation completion identity is incomplete.';
  end if;
  if query_start > query_end then
    raise exception 'Signal generation start date must not follow its complete-through date.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      query_owner::text || ':' || query_metric_version || ':signal-generation',
      0
    )
  );

  select existing.*
  into generation
  from public.intelligence_signal_generations existing
  where existing.owner_id = query_owner
    and existing.metric_version = query_metric_version
    and existing.refresh_id = query_refresh_id
  for update;

  if generation.owner_id is null then
    raise exception 'Signal generation must be initialized before completion.';
  end if;
  if generation.start_date is distinct from query_start
    or generation.complete_through is distinct from query_end
    or generation.generation_started_at is distinct from
      query_generation_started_at
    or generation.promote is distinct from query_promote
  then
    raise exception 'Signal generation completion conflicts with its immutable identity.';
  end if;

  -- An acknowledged completion may be retried after a network failure. Return
  -- the stored terminal state without reactivating an older retired generation.
  if generation.status in ('active', 'retired') then
    if generation.event_dedup_generation_id is distinct from
        query_event_generation_id
      or generation.story_dedup_generation_id is distinct from
        query_story_generation_id
    then
      raise exception 'Signal generation completion conflicts with its immutable dedup pins.';
    end if;
    return pg_catalog.jsonb_build_object(
      'refresh_id', generation.refresh_id,
      'metric_version', generation.metric_version,
      'start_date', generation.start_date,
      'complete_through', generation.complete_through,
      'generation_started_at', generation.generation_started_at,
      'status', generation.status,
      'promote', generation.promote,
      'signal_count', generation.signal_count,
      'daily_row_count', generation.daily_row_count,
      'event_dedup_generation_id', generation.event_dedup_generation_id,
      'story_dedup_generation_id', generation.story_dedup_generation_id,
      'activated_at', generation.activated_at,
      'retired_at', generation.retired_at
    );
  end if;
  if generation.status <> 'staging' then
    raise exception 'Only a staging signal generation can be completed.';
  end if;

  select
    count(*),
    count(*) filter (where refresh_segment.processed_at is null),
    count(*) filter (
      where refresh_segment.start_date <> query_start
        or refresh_segment.end_date <> query_end
        or btrim(refresh_segment.extraction_version) = ''
    )
  into
    support_segment_count,
    unprocessed_segment_count,
    mismatched_segment_count
  from public.intelligence_term_signal_refresh_segments refresh_segment
  where refresh_segment.owner_id = query_owner
    and refresh_segment.refresh_id = query_refresh_id;

  if support_segment_count = 0 then
    raise exception 'Signal generation has no frozen measurement segments.';
  end if;
  if unprocessed_segment_count > 0 then
    raise exception 'Signal generation term support still has unprocessed segments.';
  end if;
  if mismatched_segment_count > 0 then
    raise exception 'Signal generation segments do not match the immutable window.';
  end if;

  select
    count(*),
    count(refresh_term.ordinal),
    count(distinct refresh_term.ordinal),
    coalesce(min(refresh_term.ordinal), 0),
    coalesce(max(refresh_term.ordinal), 0),
    count(*) filter (
      where refresh_term.start_date <> query_start
        or refresh_term.end_date <> query_end
        or btrim(refresh_term.extraction_version) = ''
    )
  into
    support_term_count,
    ordinal_count,
    distinct_ordinal_count,
    minimum_ordinal,
    maximum_ordinal,
    mismatched_term_count
  from public.intelligence_term_signal_refresh_terms refresh_term
  where refresh_term.owner_id = query_owner
    and refresh_term.refresh_id = query_refresh_id;

  if mismatched_term_count > 0 then
    raise exception 'Signal generation terms do not match the immutable window.';
  end if;
  if ordinal_count <> support_term_count
    or distinct_ordinal_count <> support_term_count
    or (
      support_term_count > 0
      and (
        minimum_ordinal <> 1
        or maximum_ordinal <> support_term_count
      )
    )
    or query_final_ordinal <> support_term_count
  then
    raise exception 'Signal generation term ordinals are not final and contiguous.';
  end if;

  if exists (
    select 1
    from public.intelligence_signal_daily daily
    where daily.owner_id = query_owner
      and daily.refresh_id = query_refresh_id
      and (
        daily.metric_version <> query_metric_version
        or daily.signal_date < query_start
        or daily.signal_date > query_end
        or daily.generation_started_at is distinct from
          query_generation_started_at
        or coalesce(
          daily.metadata ->> 'event_dedup_generation_id',
          ''
        ) <> coalesce(query_event_generation_id::text, '')
        or coalesce(
          daily.metadata ->> 'story_dedup_generation_id',
          ''
        ) <> coalesce(query_story_generation_id::text, '')
      )
  ) then
    raise exception 'Signal generation daily rows violate their immutable identity.';
  end if;

  if exists (
    select 1
    from public.intelligence_signal_daily_totals total
    where total.owner_id = query_owner
      and total.refresh_id = query_refresh_id
      and (
        total.metric_version <> query_metric_version
        or total.signal_date < query_start
        or total.signal_date > query_end
        or total.generation_started_at is distinct from
          query_generation_started_at
      )
  ) then
    raise exception 'Signal generation denominator rows violate their immutable identity.';
  end if;

  -- Every distinct signal day, including a zero-item complete day, must have
  -- one exact persisted denominator in this same staging generation.
  if exists (
    select 1
    from public.intelligence_signal_daily daily
    left join public.intelligence_signal_daily_totals total
      on total.owner_id = daily.owner_id
     and total.metric_version = daily.metric_version
     and total.refresh_id = daily.refresh_id
     and total.signal_date = daily.signal_date
    where daily.owner_id = query_owner
      and daily.metric_version = query_metric_version
      and daily.refresh_id = query_refresh_id
      and (
        total.owner_id is null
        or daily.eligible_items <> total.eligible_items
        or daily.eligible_tokens <> total.eligible_tokens
      )
  ) then
    raise exception 'Signal generation daily rows do not match exact persisted denominators.';
  end if;

  select
    count(distinct daily.signal_key),
    count(*)
  into stored_signal_count, stored_daily_row_count
  from public.intelligence_signal_daily daily
  where daily.owner_id = query_owner
    and daily.metric_version = query_metric_version
    and daily.refresh_id = query_refresh_id;

  select count(*)
  into stored_total_count
  from public.intelligence_signal_daily_totals total
  where total.owner_id = query_owner
    and total.metric_version = query_metric_version
    and total.refresh_id = query_refresh_id;

  if stored_daily_row_count > 0 and stored_total_count = 0 then
    raise exception 'Signal generation has daily rows but no persisted denominators.';
  end if;

  activated_time := pg_catalog.now();
  if query_promote then
    update public.intelligence_signal_generations previous
    set
      status = 'retired',
      retired_at = activated_time,
      updated_at = activated_time
    where previous.owner_id = query_owner
      and previous.metric_version = query_metric_version
      and previous.status = 'active'
      and previous.refresh_id <> query_refresh_id;

    update public.intelligence_signal_generations current_generation
    set
      status = 'active',
      final_ordinal = query_final_ordinal,
      signal_count = stored_signal_count,
      daily_row_count = stored_daily_row_count,
      event_dedup_generation_id = query_event_generation_id,
      story_dedup_generation_id = query_story_generation_id,
      completed_at = activated_time,
      activated_at = activated_time,
      retired_at = null,
      updated_at = activated_time
    where current_generation.owner_id = query_owner
      and current_generation.metric_version = query_metric_version
      and current_generation.refresh_id = query_refresh_id;

    insert into public.intelligence_signal_active_generations (
      owner_id,
      metric_version,
      refresh_id,
      activated_at
    ) values (
      query_owner,
      query_metric_version,
      query_refresh_id,
      activated_time
    )
    on conflict (owner_id, metric_version) do update
    set
      refresh_id = excluded.refresh_id,
      activated_at = excluded.activated_at;
  else
    if exists (
      select 1
      from public.intelligence_signal_active_generations active
      where active.owner_id = query_owner
        and active.metric_version = query_metric_version
        and active.refresh_id = query_refresh_id
    ) then
      raise exception 'A non-promoted validation generation cannot own the active pointer.';
    end if;

    update public.intelligence_signal_generations current_generation
    set
      status = 'retired',
      final_ordinal = query_final_ordinal,
      signal_count = stored_signal_count,
      daily_row_count = stored_daily_row_count,
      event_dedup_generation_id = query_event_generation_id,
      story_dedup_generation_id = query_story_generation_id,
      completed_at = activated_time,
      activated_at = null,
      retired_at = activated_time,
      updated_at = activated_time
    where current_generation.owner_id = query_owner
      and current_generation.metric_version = query_metric_version
      and current_generation.refresh_id = query_refresh_id;
  end if;

  select completed.*
  into generation
  from public.intelligence_signal_generations completed
  where completed.owner_id = query_owner
    and completed.metric_version = query_metric_version
    and completed.refresh_id = query_refresh_id;

  return pg_catalog.jsonb_build_object(
    'refresh_id', generation.refresh_id,
    'metric_version', generation.metric_version,
    'start_date', generation.start_date,
    'complete_through', generation.complete_through,
    'generation_started_at', generation.generation_started_at,
    'status', generation.status,
    'promote', generation.promote,
    'signal_count', generation.signal_count,
    'daily_row_count', generation.daily_row_count,
    'event_dedup_generation_id', generation.event_dedup_generation_id,
    'story_dedup_generation_id', generation.story_dedup_generation_id,
    'activated_at', generation.activated_at,
    'retired_at', generation.retired_at
  );
end;
$$;

revoke all on function public.begin_intelligence_signal_generation(
  uuid, uuid, text, date, date, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.begin_intelligence_signal_generation(
  uuid, uuid, text, date, date, timestamptz, boolean
) to service_role;

revoke all on function public.complete_intelligence_signal_generation(
  uuid, uuid, text, date, date, timestamptz, integer, uuid, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.complete_intelligence_signal_generation(
  uuid, uuid, text, date, date, timestamptz, integer, uuid, uuid, boolean
) to service_role;

-- Cloned validation is fingerprinted before this RPC is called. It may then be
-- removed in bounded pages, but only when it is a finalized, non-promoted,
-- retired generation. The compact registry identity is retained as a tombstone
-- so a retried call is idempotent and a refresh UUID cannot be reused.
create or replace function public.prune_intelligence_signal_generation(
  query_owner uuid,
  query_refresh_id uuid,
  query_batch_size integer default 2500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generation public.intelligence_signal_generations%rowtype;
  bounded_batch_size integer := least(
    2500,
    greatest(100, coalesce(query_batch_size, 2500))
  );
  signal_rows_deleted bigint := 0;
  total_rows_deleted bigint := 0;
  has_more boolean := false;
  already_pruned boolean := false;
begin
  if query_owner is null or query_refresh_id is null then
    raise exception 'Validation signal generation prune identity is incomplete.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      query_owner::text || ':' || query_refresh_id::text || ':signal-prune',
      0
    )
  );

  select existing.*
  into generation
  from public.intelligence_signal_generations existing
  where existing.owner_id = query_owner
    and existing.refresh_id = query_refresh_id
  for update;

  -- A crash may occur after the final database page but before the run saves
  -- its checkpoint. Missing or compacted identities therefore succeed safely.
  if generation.owner_id is null then
    return pg_catalog.jsonb_build_object(
      'signal_rows_deleted', 0,
      'total_rows_deleted', 0,
      'generation_deleted', false,
      'already_pruned', true,
      'has_more', false
    );
  end if;

  if generation.status = 'active' or generation.promote = true then
    raise exception 'Active or promoted signal generations cannot be validation-pruned.';
  end if;
  if generation.status <> 'retired' or generation.completed_at is null then
    raise exception 'Only a finalized retired validation generation can be pruned.';
  end if;
  if exists (
    select 1
    from public.intelligence_signal_active_generations active
    where active.owner_id = generation.owner_id
      and active.metric_version = generation.metric_version
      and active.refresh_id = generation.refresh_id
  ) then
    raise exception 'The active signal generation pointer cannot be pruned.';
  end if;

  already_pruned := generation.pruned_at is not null
    and not exists (
      select 1
      from public.intelligence_signal_daily daily
      where daily.owner_id = query_owner
        and daily.refresh_id = query_refresh_id
    )
    and not exists (
      select 1
      from public.intelligence_signal_daily_totals total
      where total.owner_id = query_owner
        and total.refresh_id = query_refresh_id
    );

  with doomed as materialized (
    select daily.id
    from public.intelligence_signal_daily daily
    where daily.owner_id = query_owner
      and daily.refresh_id = query_refresh_id
    order by daily.signal_date, daily.signal_key, daily.id
    limit bounded_batch_size
  )
  delete from public.intelligence_signal_daily daily
  using doomed
  where daily.id = doomed.id;
  get diagnostics signal_rows_deleted = row_count;

  with doomed as materialized (
    select total.ctid
    from public.intelligence_signal_daily_totals total
    where total.owner_id = query_owner
      and total.refresh_id = query_refresh_id
    order by total.signal_date
    limit bounded_batch_size
  )
  delete from public.intelligence_signal_daily_totals total
  using doomed
  where total.ctid = doomed.ctid;
  get diagnostics total_rows_deleted = row_count;

  has_more := exists (
      select 1
      from public.intelligence_signal_daily daily
      where daily.owner_id = query_owner
        and daily.refresh_id = query_refresh_id
    )
    or exists (
      select 1
      from public.intelligence_signal_daily_totals total
      where total.owner_id = query_owner
        and total.refresh_id = query_refresh_id
    );

  if not has_more then
    update public.intelligence_signal_generations compacted
    set
      signal_count = 0,
      daily_row_count = 0,
      pruned_at = coalesce(compacted.pruned_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
    where compacted.owner_id = query_owner
      and compacted.metric_version = generation.metric_version
      and compacted.refresh_id = query_refresh_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'signal_rows_deleted', signal_rows_deleted,
    'total_rows_deleted', total_rows_deleted,
    'generation_deleted', false,
    'already_pruned', already_pruned,
    'has_more', has_more
  );
end;
$$;

-- Ordinary retention is deliberately separate from validation pruning. It can
-- compact abandoned staging data and old promoted rollback generations, but it
-- preserves the active pointer, the newest promoted rollback snapshot,
-- recent generations, and every refresh referenced by a live resumable run.
create or replace function public.maintain_intelligence_signal_generation_retention(
  query_owner uuid,
  query_batch_size integer default 2500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  generation public.intelligence_signal_generations%rowtype;
  bounded_batch_size integer := least(
    2500,
    greatest(100, coalesce(query_batch_size, 2500))
  );
  signal_rows_deleted bigint := 0;
  total_rows_deleted bigint := 0;
  has_more boolean := false;
  compacted boolean := false;
begin
  if query_owner is null then
    raise exception 'Signal generation retention requires an owner.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      query_owner::text || ':signal-generation-retention',
      0
    )
  );

  select candidate.*
  into generation
  from public.intelligence_signal_generations candidate
  where candidate.owner_id = query_owner
    and candidate.status <> 'active'
    and candidate.pruned_at is null
    and not exists (
      select 1
      from public.intelligence_signal_active_generations active
      where active.owner_id = candidate.owner_id
        and active.metric_version = candidate.metric_version
        and active.refresh_id = candidate.refresh_id
    )
    and (
      (
        candidate.status = 'staging'
        and candidate.generation_started_at <
          pg_catalog.now() - interval '24 hours'
      )
      or (
        candidate.status = 'retired'
        and candidate.promote = false
        and coalesce(candidate.retired_at, candidate.completed_at) <
          pg_catalog.now() - interval '24 hours'
      )
      or (
        candidate.status = 'retired'
        and candidate.promote = true
        and coalesce(candidate.retired_at, candidate.completed_at) <
          pg_catalog.now() - interval '24 hours'
        and not exists (
          select 1
          from (
            select rollback.refresh_id
            from public.intelligence_signal_generations rollback
            where rollback.owner_id = candidate.owner_id
              and rollback.metric_version = candidate.metric_version
              and rollback.status = 'retired'
              and rollback.promote = true
              and rollback.pruned_at is null
            order by
              rollback.completed_at desc nulls last,
              rollback.generation_started_at desc,
              rollback.refresh_id
            limit 1
          ) retained_rollback
          where retained_rollback.refresh_id = candidate.refresh_id
        )
      )
    )
    and not exists (
      select 1
      from public.intelligence_runs live_run
      where live_run.owner_id = query_owner
        and live_run.status in ('running', 'partial')
        and coalesce(
          live_run.heartbeat_at,
          live_run.started_at,
          live_run.created_at
        ) >= pg_catalog.now() - case
          when coalesce(
            live_run.checkpoint_after ->> 'job',
            live_run.checkpoint_before ->> 'job'
          ) = 'intelligence_v2_local_signal_refresh'
            and coalesce(
              live_run.checkpoint_after ->> 'validation_mode',
              live_run.checkpoint_before ->> 'validation_mode'
            ) in ('cloned_backfill_window', 'current_window')
          then interval '7 days'
          else interval '24 hours'
        end
        and (
          live_run.id = candidate.refresh_id
          or live_run.checkpoint_before::text like
            '%' || candidate.refresh_id::text || '%'
          or live_run.checkpoint_after::text like
            '%' || candidate.refresh_id::text || '%'
        )
    )
  order by
    (candidate.status = 'staging') desc,
    coalesce(
      candidate.retired_at,
      candidate.completed_at,
      candidate.generation_started_at
    ),
    candidate.refresh_id
  limit 1
  for update skip locked;

  if generation.owner_id is null then
    return pg_catalog.jsonb_build_object(
      'refresh_id', null,
      'metric_version', null,
      'signal_rows_deleted', 0,
      'total_rows_deleted', 0,
      'compacted', false,
      'has_more', false
    );
  end if;

  if generation.status = 'staging' then
    update public.intelligence_signal_generations abandoned
    set
      status = 'retired',
      retired_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where abandoned.owner_id = generation.owner_id
      and abandoned.metric_version = generation.metric_version
      and abandoned.refresh_id = generation.refresh_id;
  end if;

  with doomed as materialized (
    select daily.id
    from public.intelligence_signal_daily daily
    where daily.owner_id = generation.owner_id
      and daily.metric_version = generation.metric_version
      and daily.refresh_id = generation.refresh_id
    order by daily.signal_date, daily.signal_key, daily.id
    limit bounded_batch_size
  )
  delete from public.intelligence_signal_daily daily
  using doomed
  where daily.id = doomed.id;
  get diagnostics signal_rows_deleted = row_count;

  with doomed as materialized (
    select total.ctid
    from public.intelligence_signal_daily_totals total
    where total.owner_id = generation.owner_id
      and total.metric_version = generation.metric_version
      and total.refresh_id = generation.refresh_id
    order by total.signal_date
    limit bounded_batch_size
  )
  delete from public.intelligence_signal_daily_totals total
  using doomed
  where total.ctid = doomed.ctid;
  get diagnostics total_rows_deleted = row_count;

  has_more := exists (
      select 1
      from public.intelligence_signal_daily daily
      where daily.owner_id = generation.owner_id
        and daily.metric_version = generation.metric_version
        and daily.refresh_id = generation.refresh_id
    )
    or exists (
      select 1
      from public.intelligence_signal_daily_totals total
      where total.owner_id = generation.owner_id
        and total.metric_version = generation.metric_version
        and total.refresh_id = generation.refresh_id
    );

  if not has_more then
    update public.intelligence_signal_generations retained_identity
    set
      status = 'retired',
      signal_count = 0,
      daily_row_count = 0,
      retired_at = coalesce(retained_identity.retired_at, pg_catalog.now()),
      pruned_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    where retained_identity.owner_id = generation.owner_id
      and retained_identity.metric_version = generation.metric_version
      and retained_identity.refresh_id = generation.refresh_id;
    compacted := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'refresh_id', generation.refresh_id,
    'metric_version', generation.metric_version,
    'signal_rows_deleted', signal_rows_deleted,
    'total_rows_deleted', total_rows_deleted,
    'compacted', compacted,
    'has_more', has_more
  );
end;
$$;

revoke all on function public.prune_intelligence_signal_generation(
  uuid, uuid, integer
) from public, anon, authenticated;
grant execute on function public.prune_intelligence_signal_generation(
  uuid, uuid, integer
) to service_role;

revoke all on function public.maintain_intelligence_signal_generation_retention(
  uuid, integer
) from public, anon, authenticated;
grant execute on function public.maintain_intelligence_signal_generation_retention(
  uuid, integer
) to service_role;
