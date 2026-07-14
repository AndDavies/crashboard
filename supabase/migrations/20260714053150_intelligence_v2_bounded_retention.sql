-- Bounded retention for immutable v2 staging snapshots and dedup generations.
-- Active generations, signal-history references, live runs, recent rollback
-- generations, and recent clone sources are preserved. Each call removes only
-- one bounded page so it stays below the production statement timeout.

create index if not exists intelligence_signal_daily_story_generation_idx
  on public.intelligence_signal_daily (
    owner_id,
    ((metadata ->> 'story_dedup_generation_id'))
  )
  where metadata ->> 'story_dedup_generation_id' is not null;

create index if not exists intelligence_signal_daily_event_generation_idx
  on public.intelligence_signal_daily (
    owner_id,
    ((metadata ->> 'event_dedup_generation_id'))
  )
  where metadata ->> 'event_dedup_generation_id' is not null;

create index if not exists intelligence_clusters_story_generation_idx
  on public.intelligence_clusters (
    owner_id,
    ((metadata ->> 'story_generation_id'))
  )
  where metadata ->> 'story_generation_id' is not null;

create index if not exists intelligence_term_signal_support_clones_updated_idx
  on public.intelligence_term_signal_support_clones (owner_id, updated_at);

create or replace function public.maintain_intelligence_v2_retention(
  query_owner uuid,
  query_batch_size integer default 2500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bounded_batch_size integer := least(2500, greatest(100, coalesce(query_batch_size, 2500)));
  stale_refresh_id uuid;
  stale_story_generation_id uuid;
  stale_event_generation_id uuid;
  clone_rows_deleted bigint := 0;
  term_rows_deleted bigint := 0;
  segment_rows_deleted bigint := 0;
  story_clusters_deleted bigint := 0;
  story_generations_deleted bigint := 0;
  event_memberships_deleted bigint := 0;
  event_generations_deleted bigint := 0;
  orphan_event_clusters_deleted bigint := 0;
begin
  if query_owner is null then
    raise exception 'Intelligence v2 retention requires an owner.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(query_owner::text || ':intelligence-v2-retention', 0)
  );

  with doomed as materialized (
    select clone_state.ctid
    from public.intelligence_term_signal_support_clones clone_state
    where clone_state.owner_id = query_owner
      and clone_state.updated_at < pg_catalog.now() - interval '7 days'
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
            live_run.id in (clone_state.source_refresh_id, clone_state.target_refresh_id)
            or live_run.checkpoint_before::text like
              '%' || clone_state.source_refresh_id::text || '%'
            or live_run.checkpoint_before::text like
              '%' || clone_state.target_refresh_id::text || '%'
            or live_run.checkpoint_after::text like
              '%' || clone_state.source_refresh_id::text || '%'
            or live_run.checkpoint_after::text like
              '%' || clone_state.target_refresh_id::text || '%'
          )
      )
    order by clone_state.updated_at, clone_state.target_refresh_id
    limit bounded_batch_size
  )
  delete from public.intelligence_term_signal_support_clones clone_state
  using doomed
  where clone_state.ctid = doomed.ctid;
  get diagnostics clone_rows_deleted = row_count;

  select candidate.refresh_id
  into stale_refresh_id
  from (
    select refresh_id, min(created_at) as created_at
    from public.intelligence_term_signal_refresh_terms
    where owner_id = query_owner
      and created_at < pg_catalog.now() - interval '7 days'
    group by refresh_id
  ) candidate
  where not exists (
      select 1
      from public.intelligence_term_signal_refresh_terms recent_term
      where recent_term.owner_id = query_owner
        and recent_term.refresh_id = candidate.refresh_id
        and recent_term.created_at >= pg_catalog.now() - interval '7 days'
    )
    and not exists (
      select 1
      from public.intelligence_term_signal_refresh_segments recent_segment
      where recent_segment.owner_id = query_owner
        and recent_segment.refresh_id = candidate.refresh_id
        and recent_segment.created_at >= pg_catalog.now() - interval '7 days'
    )
    and not exists (
      select 1
      from public.intelligence_term_signal_support_clones clone_state
      where clone_state.owner_id = query_owner
        and candidate.refresh_id in (
          clone_state.source_refresh_id,
          clone_state.target_refresh_id
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
    and not exists (
      select 1
      from (
        select recent_run.id, recent_run.checkpoint_after
        from public.intelligence_runs recent_run
        where recent_run.owner_id = query_owner
          and recent_run.status = 'completed'
          and recent_run.run_type in ('backfill', 'signal_refresh')
        order by recent_run.completed_at desc nulls last, recent_run.created_at desc
        limit 3
      ) retained_run
      where retained_run.id = candidate.refresh_id
        or retained_run.checkpoint_after::text like
          '%' || candidate.refresh_id::text || '%'
    )
    and not exists (
      select 1
      from (
        select canonical_backfill.id, canonical_backfill.checkpoint_after
        from public.intelligence_runs canonical_backfill
        where canonical_backfill.owner_id = query_owner
          and canonical_backfill.run_type = 'backfill'
          and canonical_backfill.status = 'completed'
          and canonical_backfill.checkpoint_after ->> 'job' = 'intelligence_v2'
          and canonical_backfill.checkpoint_after ->> 'phase' = 'complete'
        order by canonical_backfill.completed_at desc nulls last,
          canonical_backfill.created_at desc
        limit 1
      ) retained_backfill
      where retained_backfill.id = candidate.refresh_id
        or retained_backfill.checkpoint_after::text like
          '%' || candidate.refresh_id::text || '%'
    )
  order by candidate.created_at, candidate.refresh_id
  limit 1;

  if stale_refresh_id is null then
    select candidate.refresh_id
    into stale_refresh_id
    from (
      select refresh_id, min(created_at) as created_at
      from public.intelligence_term_signal_refresh_segments
      where owner_id = query_owner
        and created_at < pg_catalog.now() - interval '7 days'
      group by refresh_id
    ) candidate
    where not exists (
        select 1
        from public.intelligence_term_signal_refresh_segments recent_segment
        where recent_segment.owner_id = query_owner
          and recent_segment.refresh_id = candidate.refresh_id
          and recent_segment.created_at >= pg_catalog.now() - interval '7 days'
      )
      and not exists (
        select 1
        from public.intelligence_term_signal_refresh_terms recent_term
        where recent_term.owner_id = query_owner
          and recent_term.refresh_id = candidate.refresh_id
          and recent_term.created_at >= pg_catalog.now() - interval '7 days'
      )
      and not exists (
        select 1
        from public.intelligence_term_signal_support_clones clone_state
        where clone_state.owner_id = query_owner
          and candidate.refresh_id in (
            clone_state.source_refresh_id,
            clone_state.target_refresh_id
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
      and not exists (
        select 1
        from (
          select recent_run.id, recent_run.checkpoint_after
          from public.intelligence_runs recent_run
          where recent_run.owner_id = query_owner
            and recent_run.status = 'completed'
            and recent_run.run_type in ('backfill', 'signal_refresh')
          order by recent_run.completed_at desc nulls last, recent_run.created_at desc
          limit 3
        ) retained_run
        where retained_run.id = candidate.refresh_id
          or retained_run.checkpoint_after::text like
            '%' || candidate.refresh_id::text || '%'
      )
      and not exists (
        select 1
        from (
          select canonical_backfill.id, canonical_backfill.checkpoint_after
          from public.intelligence_runs canonical_backfill
          where canonical_backfill.owner_id = query_owner
            and canonical_backfill.run_type = 'backfill'
            and canonical_backfill.status = 'completed'
            and canonical_backfill.checkpoint_after ->> 'job' = 'intelligence_v2'
            and canonical_backfill.checkpoint_after ->> 'phase' = 'complete'
          order by canonical_backfill.completed_at desc nulls last,
            canonical_backfill.created_at desc
          limit 1
        ) retained_backfill
        where retained_backfill.id = candidate.refresh_id
          or retained_backfill.checkpoint_after::text like
            '%' || candidate.refresh_id::text || '%'
      )
    order by candidate.created_at, candidate.refresh_id
    limit 1;
  end if;

  if stale_refresh_id is not null then
    with doomed as materialized (
      select refresh_term.ctid
      from public.intelligence_term_signal_refresh_terms refresh_term
      where refresh_term.owner_id = query_owner
        and refresh_term.refresh_id = stale_refresh_id
      order by refresh_term.normalized_term
      limit bounded_batch_size
    )
    delete from public.intelligence_term_signal_refresh_terms refresh_term
    using doomed
    where refresh_term.ctid = doomed.ctid;
    get diagnostics term_rows_deleted = row_count;

    with doomed as materialized (
      select refresh_segment.ctid
      from public.intelligence_term_signal_refresh_segments refresh_segment
      where refresh_segment.owner_id = query_owner
        and refresh_segment.refresh_id = stale_refresh_id
      order by refresh_segment.segment_id
      limit bounded_batch_size
    )
    delete from public.intelligence_term_signal_refresh_segments refresh_segment
    using doomed
    where refresh_segment.ctid = doomed.ctid;
    get diagnostics segment_rows_deleted = row_count;
  end if;

  select generation.generation_id
  into stale_story_generation_id
  from public.intelligence_story_dedup_generations generation
  where generation.owner_id = query_owner
    and generation.status <> 'active'
    and (
      (generation.status = 'retired'
        and generation.retired_at < pg_catalog.now() - interval '7 days')
      or (generation.status = 'staging'
        and generation.created_at < pg_catalog.now() - interval '1 day')
    )
    and generation.generation_id not in (
      select retained.generation_id
      from public.intelligence_story_dedup_generations retained
      where retained.owner_id = query_owner
        and retained.status = 'retired'
      order by retained.retired_at desc nulls last
      limit 2
    )
    and not exists (
      select 1
      from public.intelligence_signal_daily daily
      where daily.owner_id = query_owner
        and daily.metadata ->> 'story_dedup_generation_id' = generation.generation_id::text
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
          live_run.id = generation.holder_run_id
          or live_run.checkpoint_before::text like
            '%' || generation.generation_id::text || '%'
          or live_run.checkpoint_after::text like
            '%' || generation.generation_id::text || '%'
        )
    )
  order by coalesce(generation.retired_at, generation.created_at), generation.generation_id
  limit 1;

  if stale_story_generation_id is not null then
    with doomed as materialized (
      select cluster_row.id
      from public.intelligence_clusters cluster_row
      where cluster_row.owner_id = query_owner
        and cluster_row.metadata ->> 'story_generation_id' =
          stale_story_generation_id::text
      order by cluster_row.id
      limit bounded_batch_size
    )
    delete from public.intelligence_clusters cluster_row
    using doomed
    where cluster_row.owner_id = query_owner
      and cluster_row.id = doomed.id;
    get diagnostics story_clusters_deleted = row_count;

    if not exists (
      select 1
      from public.intelligence_clusters cluster_row
      where cluster_row.owner_id = query_owner
        and cluster_row.metadata ->> 'story_generation_id' =
          stale_story_generation_id::text
    ) then
      delete from public.intelligence_story_dedup_generations generation
      where generation.owner_id = query_owner
        and generation.generation_id = stale_story_generation_id
        and generation.status <> 'active';
      get diagnostics story_generations_deleted = row_count;
    end if;
  end if;

  select generation.generation_id
  into stale_event_generation_id
  from public.intelligence_event_dedup_generations generation
  where generation.owner_id = query_owner
    and generation.status <> 'active'
    and (
      (generation.status = 'retired'
        and generation.retired_at < pg_catalog.now() - interval '7 days')
      or (generation.status = 'staging'
        and generation.created_at < pg_catalog.now() - interval '1 day')
    )
    and generation.generation_id not in (
      select retained.generation_id
      from public.intelligence_event_dedup_generations retained
      where retained.owner_id = query_owner
        and retained.status = 'retired'
      order by retained.retired_at desc nulls last
      limit 2
    )
    and not exists (
      select 1
      from public.intelligence_signal_daily daily
      where daily.owner_id = query_owner
        and daily.metadata ->> 'event_dedup_generation_id' = generation.generation_id::text
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
          live_run.id = generation.holder_run_id
          or live_run.checkpoint_before::text like
            '%' || generation.generation_id::text || '%'
          or live_run.checkpoint_after::text like
            '%' || generation.generation_id::text || '%'
        )
    )
  order by coalesce(generation.retired_at, generation.created_at), generation.generation_id
  limit 1;

  if stale_event_generation_id is not null then
    with doomed as materialized (
      select membership.ctid
      from public.intelligence_event_cluster_memberships membership
      where membership.owner_id = query_owner
        and membership.generation_id = stale_event_generation_id
      order by membership.event_id
      limit bounded_batch_size
    )
    delete from public.intelligence_event_cluster_memberships membership
    using doomed
    where membership.ctid = doomed.ctid;
    get diagnostics event_memberships_deleted = row_count;

    if not exists (
      select 1
      from public.intelligence_event_cluster_memberships membership
      where membership.owner_id = query_owner
        and membership.generation_id = stale_event_generation_id
    ) then
      delete from public.intelligence_event_dedup_generations generation
      where generation.owner_id = query_owner
        and generation.generation_id = stale_event_generation_id
        and generation.status <> 'active';
      get diagnostics event_generations_deleted = row_count;
    end if;
  end if;

  with doomed as materialized (
    select cluster_row.id
    from public.intelligence_clusters cluster_row
    where cluster_row.owner_id = query_owner
      and cluster_row.cluster_type = 'event'
      and cluster_row.metadata ->> 'dedupe_version' is not null
      and cluster_row.updated_at < pg_catalog.now() - interval '7 days'
      and not exists (
        select 1
        from public.intelligence_event_cluster_memberships membership
        where membership.owner_id = query_owner
          and membership.cluster_id = cluster_row.id
      )
      and not exists (
        select 1
        from public.intelligence_events event_row
        where event_row.owner_id = query_owner
          and event_row.cluster_id = cluster_row.id
      )
    order by cluster_row.updated_at, cluster_row.id
    limit bounded_batch_size
  )
  delete from public.intelligence_clusters cluster_row
  using doomed
  where cluster_row.owner_id = query_owner
    and cluster_row.id = doomed.id;
  get diagnostics orphan_event_clusters_deleted = row_count;

  return pg_catalog.jsonb_build_object(
    'batch_size', bounded_batch_size,
    'stale_refresh_id', stale_refresh_id,
    'clone_rows_deleted', clone_rows_deleted,
    'term_rows_deleted', term_rows_deleted,
    'segment_rows_deleted', segment_rows_deleted,
    'stale_story_generation_id', stale_story_generation_id,
    'story_clusters_deleted', story_clusters_deleted,
    'story_generations_deleted', story_generations_deleted,
    'stale_event_generation_id', stale_event_generation_id,
    'event_memberships_deleted', event_memberships_deleted,
    'event_generations_deleted', event_generations_deleted,
    'orphan_event_clusters_deleted', orphan_event_clusters_deleted,
    'has_more',
      clone_rows_deleted = bounded_batch_size
      or stale_refresh_id is not null
      or stale_story_generation_id is not null
      or stale_event_generation_id is not null
      or term_rows_deleted = bounded_batch_size
      or segment_rows_deleted = bounded_batch_size
      or story_clusters_deleted = bounded_batch_size
      or event_memberships_deleted = bounded_batch_size
      or orphan_event_clusters_deleted = bounded_batch_size
  );
end;
$$;

revoke all on function public.maintain_intelligence_v2_retention(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.maintain_intelligence_v2_retention(uuid, integer)
  to service_role;
