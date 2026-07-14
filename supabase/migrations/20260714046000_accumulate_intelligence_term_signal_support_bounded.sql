-- Bound support accumulation by both segment count and actual observation
-- volume. A small number of unusually dense newsletter segments can otherwise
-- exceed the PostgREST statement timeout even when the segment page is small.

create or replace function public.accumulate_intelligence_term_signal_refresh_v2(
  query_owner uuid,
  query_refresh_id uuid,
  query_extraction_version text,
  query_start date,
  query_end date,
  query_segment_ids uuid[],
  query_batch_size integer,
  query_observation_budget integer default 2000,
  query_reset boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  processed_segment_count bigint := 0;
  processed_observation_count bigint := 0;
  remaining_segment_count bigint := 0;
  total_segment_count bigint := 0;
  bounded_batch_size integer := least(greatest(query_batch_size, 1), 1000);
  bounded_observation_budget integer := least(
    greatest(query_observation_budget, 100),
    20000
  );
begin
  if query_start > query_end then
    raise exception 'Term signal refresh start date must not be after its end date.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(query_owner::text || ':' || query_refresh_id::text, 0)
  );

  if query_reset then
    delete from public.intelligence_term_signal_refresh_terms
    where owner_id = query_owner and refresh_id = query_refresh_id;
    delete from public.intelligence_term_signal_refresh_segments
    where owner_id = query_owner and refresh_id = query_refresh_id;
  end if;

  -- Stale-snapshot retention is intentionally not performed here. Grouping
  -- every historical support row on every page made later pages progressively
  -- slower and eventually exhausted the request timeout. Cleanup belongs in a
  -- separately checkpointed maintenance pass, while this hot path touches only
  -- the active source and target snapshots.
  update public.intelligence_term_signal_refresh_terms refresh_term
  set created_at = pg_catalog.now()
  where refresh_term.ctid = (
    select active.ctid
    from public.intelligence_term_signal_refresh_terms active
    where active.owner_id = query_owner
      and active.refresh_id = query_refresh_id
    order by active.normalized_term
    limit 1
  );
  update public.intelligence_term_signal_refresh_segments refresh_segment
  set created_at = pg_catalog.now()
  where refresh_segment.ctid = (
    select active.ctid
    from public.intelligence_term_signal_refresh_segments active
    where active.owner_id = query_owner
      and active.refresh_id = query_refresh_id
    order by active.segment_id
    limit 1
  );

  insert into public.intelligence_term_signal_refresh_segments (
    owner_id,
    refresh_id,
    segment_id,
    extraction_version,
    start_date,
    end_date
  )
  select
    query_owner,
    query_refresh_id,
    requested.segment_id,
    query_extraction_version,
    query_start,
    query_end
  from unnest(coalesce(query_segment_ids, '{}'::uuid[])) as requested(segment_id)
  join public.intelligence_document_segments segment
    on segment.id = requested.segment_id
   and segment.owner_id = query_owner
  on conflict (owner_id, refresh_id, segment_id) do nothing;

  with candidate_segments as materialized (
    select refresh_segment.segment_id
    from public.intelligence_term_signal_refresh_segments refresh_segment
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.extraction_version = query_extraction_version
      and refresh_segment.start_date = query_start
      and refresh_segment.end_date = query_end
      and refresh_segment.processed_at is null
    order by refresh_segment.segment_id
    limit bounded_batch_size
    for update skip locked
  ), weighted_segments as materialized (
    select
      candidate.segment_id,
      row_number() over (order by candidate.segment_id) as position,
      count(observation.segment_id)::bigint as observation_count
    from candidate_segments candidate
    left join public.intelligence_term_observations observation
      on observation.segment_id = candidate.segment_id
     and observation.owner_id = query_owner
     and observation.extraction_version = query_extraction_version
     and observation.observed_on between query_start and query_end
    group by candidate.segment_id
  ), ranked_segments as materialized (
    select
      weighted.segment_id,
      weighted.position,
      weighted.observation_count,
      sum(weighted.observation_count) over (
        order by weighted.position
        rows between unbounded preceding and current row
      ) as cumulative_observation_count
    from weighted_segments weighted
  ), selected_segments as materialized (
    select ranked.segment_id, ranked.observation_count
    from ranked_segments ranked
    where ranked.position = 1
       or ranked.cumulative_observation_count <= bounded_observation_budget
    order by ranked.position
  ), batch_support as materialized (
    select
      observation.normalized_term,
      count(distinct observation.segment_id)::integer as observation_count
    from public.intelligence_term_observations observation
    join selected_segments eligible
      on eligible.segment_id = observation.segment_id
    where observation.owner_id = query_owner
      and observation.extraction_version = query_extraction_version
      and observation.observed_on between query_start and query_end
    group by observation.normalized_term
  ), upserted_terms as (
    insert into public.intelligence_term_signal_refresh_terms (
      owner_id,
      refresh_id,
      normalized_term,
      observation_count,
      extraction_version,
      start_date,
      end_date
    )
    select
      query_owner,
      query_refresh_id,
      supported.normalized_term,
      supported.observation_count,
      query_extraction_version,
      query_start,
      query_end
    from batch_support supported
    on conflict (owner_id, refresh_id, normalized_term) do update
    set
      observation_count = public.intelligence_term_signal_refresh_terms.observation_count
        + excluded.observation_count,
      created_at = pg_catalog.now()
    returning 1
  ), marked_segments as (
    update public.intelligence_term_signal_refresh_segments refresh_segment
    set processed_at = pg_catalog.now()
    from selected_segments selected
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.segment_id = selected.segment_id
    returning selected.observation_count
  )
  select
    count(*),
    coalesce(sum(marked_segments.observation_count), 0)
  into processed_segment_count, processed_observation_count
  from marked_segments;

  select
    count(*) filter (where processed_at is null),
    count(*)
  into remaining_segment_count, total_segment_count
  from public.intelligence_term_signal_refresh_segments
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and extraction_version = query_extraction_version
    and start_date = query_start
    and end_date = query_end;

  return pg_catalog.jsonb_build_object(
    'processed_segment_count', processed_segment_count,
    'processed_observation_count', processed_observation_count,
    'remaining_segment_count', remaining_segment_count,
    'total_segment_count', total_segment_count
  );
end;
$$;

revoke all on function public.accumulate_intelligence_term_signal_refresh_v2(
  uuid, uuid, text, date, date, uuid[], integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.accumulate_intelligence_term_signal_refresh_v2(
  uuid, uuid, text, date, date, uuid[], integer, integer, boolean
) to service_role;
