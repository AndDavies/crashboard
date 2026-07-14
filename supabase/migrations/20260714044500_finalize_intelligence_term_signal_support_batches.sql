-- Finalize high-cardinality term support in bounded, resumable transactions.
-- Production PostgREST applies a short statement timeout, so pruning and
-- ordinal assignment must never require one archive-wide write.

create or replace function public.finalize_intelligence_term_signal_support_v2(
  query_owner uuid,
  query_refresh_id uuid,
  query_extraction_version text,
  query_start date,
  query_end date,
  query_batch_size integer default 2000
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bounded_batch_size integer := least(5000, greatest(1, query_batch_size));
  changed_count bigint := 0;
  current_ordinal bigint := 0;
  candidate_count bigint := 0;
begin
  if query_start > query_end then
    raise exception 'Term signal refresh start date must not be after its end date.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(query_owner::text || ':' || query_refresh_id::text, 0)
  );

  if exists (
    select 1
    from public.intelligence_term_signal_refresh_segments refresh_segment
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.extraction_version = query_extraction_version
      and refresh_segment.start_date = query_start
      and refresh_segment.end_date = query_end
      and refresh_segment.processed_at is null
  ) then
    raise exception 'Term signal support still has unprocessed segments.';
  end if;

  -- One recent row is sufficient to keep this resumable snapshot out of the
  -- stale-refresh collector without rewriting the complete support table.
  update public.intelligence_term_signal_refresh_terms refresh_term
  set created_at = pg_catalog.now()
  where refresh_term.ctid = (
    select candidate.ctid
    from public.intelligence_term_signal_refresh_terms candidate
    where candidate.owner_id = query_owner
      and candidate.refresh_id = query_refresh_id
      and candidate.extraction_version = query_extraction_version
      and candidate.start_date = query_start
      and candidate.end_date = query_end
    order by candidate.normalized_term
    limit 1
  );

  -- Pruning is deliberately its own resumable phase. Existing ordinals are
  -- cleared only when support accumulation resets the snapshot, so a retry is
  -- safe after any committed batch.
  with doomed as materialized (
    select refresh_term.ctid
    from public.intelligence_term_signal_refresh_terms refresh_term
    where refresh_term.owner_id = query_owner
      and refresh_term.refresh_id = query_refresh_id
      and refresh_term.extraction_version = query_extraction_version
      and refresh_term.start_date = query_start
      and refresh_term.end_date = query_end
      and refresh_term.observation_count < 3
    order by refresh_term.normalized_term
    limit bounded_batch_size
  )
  delete from public.intelligence_term_signal_refresh_terms refresh_term
  using doomed
  where refresh_term.ctid = doomed.ctid;

  get diagnostics changed_count = row_count;
  if changed_count > 0 then
    return pg_catalog.jsonb_build_object(
      'stage', 'prune',
      'has_more', true,
      'processed_count', changed_count,
      'candidate_term_count', 0
    );
  end if;

  select coalesce(max(refresh_term.ordinal), 0)
  into current_ordinal
  from public.intelligence_term_signal_refresh_terms refresh_term
  where refresh_term.owner_id = query_owner
    and refresh_term.refresh_id = query_refresh_id
    and refresh_term.extraction_version = query_extraction_version
    and refresh_term.start_date = query_start
    and refresh_term.end_date = query_end;

  with selected as materialized (
    select
      refresh_term.ctid,
      row_number() over (order by refresh_term.normalized_term)::integer
        + current_ordinal as ordinal
    from public.intelligence_term_signal_refresh_terms refresh_term
    where refresh_term.owner_id = query_owner
      and refresh_term.refresh_id = query_refresh_id
      and refresh_term.extraction_version = query_extraction_version
      and refresh_term.start_date = query_start
      and refresh_term.end_date = query_end
      and refresh_term.ordinal is null
    order by refresh_term.normalized_term
    limit bounded_batch_size
  )
  update public.intelligence_term_signal_refresh_terms refresh_term
  set ordinal = selected.ordinal
  from selected
  where refresh_term.ctid = selected.ctid;

  get diagnostics changed_count = row_count;
  if changed_count > 0 then
    return pg_catalog.jsonb_build_object(
      'stage', 'ordinal',
      'has_more', true,
      'processed_count', changed_count,
      'candidate_term_count', current_ordinal + changed_count
    );
  end if;

  select count(*)
  into candidate_count
  from public.intelligence_term_signal_refresh_terms refresh_term
  where refresh_term.owner_id = query_owner
    and refresh_term.refresh_id = query_refresh_id
    and refresh_term.extraction_version = query_extraction_version
    and refresh_term.start_date = query_start
    and refresh_term.end_date = query_end
    and refresh_term.ordinal is not null;

  return pg_catalog.jsonb_build_object(
    'stage', 'complete',
    'has_more', false,
    'processed_count', 0,
    'candidate_term_count', candidate_count
  );
end;
$$;

revoke all on function public.finalize_intelligence_term_signal_support_v2(
  uuid, uuid, text, date, date, integer
) from public, anon, authenticated;
grant execute on function public.finalize_intelligence_term_signal_support_v2(
  uuid, uuid, text, date, date, integer
) to service_role;
