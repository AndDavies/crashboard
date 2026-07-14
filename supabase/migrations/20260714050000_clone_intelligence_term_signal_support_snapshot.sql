-- Reuse a completed term-support snapshot for local post-backfill validation.
-- Each call copies one bounded batch and commits its cursor atomically. The
-- clone state distinguishes a resumable RPC-created prefix from an arbitrary
-- partial target, which is rejected.

create table if not exists public.intelligence_term_signal_support_clones (
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_refresh_id uuid not null,
  source_refresh_id uuid not null,
  extraction_version text not null check (btrim(extraction_version) <> ''),
  start_date date not null,
  end_date date not null,
  phase text not null default 'segments' check (phase in (
    'segments', 'terms', 'complete'
  )),
  source_segment_count bigint not null check (source_segment_count > 0),
  source_term_count bigint not null check (source_term_count >= 0),
  source_final_ordinal integer not null check (source_final_ordinal >= 0),
  copied_segment_count bigint not null default 0 check (copied_segment_count >= 0),
  copied_term_count bigint not null default 0 check (copied_term_count >= 0),
  last_segment_id uuid,
  last_term_ordinal integer not null default 0 check (last_term_ordinal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, target_refresh_id),
  check (source_refresh_id <> target_refresh_id),
  check (start_date <= end_date),
  check (copied_segment_count <= source_segment_count),
  check (copied_term_count <= source_term_count)
);

create index if not exists intelligence_term_signal_support_clones_source_idx
  on public.intelligence_term_signal_support_clones (
    owner_id,
    source_refresh_id,
    updated_at desc
  );

alter table public.intelligence_term_signal_support_clones enable row level security;
revoke all on table public.intelligence_term_signal_support_clones
  from public, anon, authenticated;
grant all on table public.intelligence_term_signal_support_clones to service_role;

create or replace function public.clone_intelligence_term_signal_support_snapshot(
  query_owner uuid,
  query_source_refresh_id uuid,
  query_target_refresh_id uuid,
  query_extraction_version text,
  query_start date,
  query_end date,
  query_batch_size integer default 1000
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clone_state public.intelligence_term_signal_support_clones%rowtype;
  bounded_batch_size integer := least(
    2000,
    greatest(100, coalesce(query_batch_size, 1000))
  );
  source_segment_count bigint := 0;
  source_unprocessed_segment_count bigint := 0;
  source_invalid_segment_count bigint := 0;
  source_term_count bigint := 0;
  source_unfinalized_term_count bigint := 0;
  source_invalid_term_count bigint := 0;
  source_distinct_ordinal_count bigint := 0;
  source_first_ordinal integer := 0;
  source_final_ordinal integer := 0;
  target_segment_count bigint := 0;
  target_term_count bigint := 0;
  copied_in_batch bigint := 0;
  copied_segment_in_batch bigint := 0;
  copied_term_in_batch bigint := 0;
  batch_last_segment_id uuid;
  batch_last_term_ordinal integer;
begin
  if query_owner is null
    or query_source_refresh_id is null
    or query_target_refresh_id is null
    or btrim(coalesce(query_extraction_version, '')) = ''
    or query_start is null
    or query_end is null
  then
    raise exception 'Term signal support clone requires a complete source and target contract.';
  end if;
  if query_source_refresh_id = query_target_refresh_id then
    raise exception 'Term signal support source and target refreshes must differ.';
  end if;
  if query_start > query_end then
    raise exception 'Term signal support clone start date must not be after its end date.';
  end if;

  -- Match the locks used by accumulation and take both refresh locks in a
  -- deterministic order. This prevents a clone from racing a reset/finalize
  -- call without introducing a table-wide lock.
  if query_source_refresh_id::text < query_target_refresh_id::text then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        query_owner::text || ':' || query_source_refresh_id::text,
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        query_owner::text || ':' || query_target_refresh_id::text,
        0
      )
    );
  else
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        query_owner::text || ':' || query_target_refresh_id::text,
        0
      )
    );
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        query_owner::text || ':' || query_source_refresh_id::text,
        0
      )
    );
  end if;

  select * into clone_state
  from public.intelligence_term_signal_support_clones
  where owner_id = query_owner
    and target_refresh_id = query_target_refresh_id
  for update;

  if clone_state.owner_id is null then
    -- A source snapshot is reusable only after its full eligible set was
    -- processed and every retained term received its final contiguous ordinal.
    select
      count(*),
      count(*) filter (where processed_at is null),
      count(*) filter (
        where extraction_version is distinct from query_extraction_version
          or start_date is distinct from query_start
          or end_date is distinct from query_end
      )
    into
      source_segment_count,
      source_unprocessed_segment_count,
      source_invalid_segment_count
    from public.intelligence_term_signal_refresh_segments
    where owner_id = query_owner
      and refresh_id = query_source_refresh_id;

    if source_segment_count = 0 then
      raise exception 'Term signal support source snapshot has no eligible segments.';
    end if;
    if source_unprocessed_segment_count <> 0 then
      raise exception 'Term signal support source snapshot has unprocessed segments.';
    end if;
    if source_invalid_segment_count <> 0 then
      raise exception 'Term signal support source segment contract does not match the requested version or window.';
    end if;

    select
      count(*),
      count(*) filter (where ordinal is null),
      count(*) filter (
        where extraction_version is distinct from query_extraction_version
          or start_date is distinct from query_start
          or end_date is distinct from query_end
      ),
      count(distinct ordinal) filter (where ordinal is not null),
      coalesce(min(ordinal), 0),
      coalesce(max(ordinal), 0)
    into
      source_term_count,
      source_unfinalized_term_count,
      source_invalid_term_count,
      source_distinct_ordinal_count,
      source_first_ordinal,
      source_final_ordinal
    from public.intelligence_term_signal_refresh_terms
    where owner_id = query_owner
      and refresh_id = query_source_refresh_id;

    if source_unfinalized_term_count <> 0
      or source_invalid_term_count <> 0
      or source_distinct_ordinal_count <> source_term_count
      or (
        source_term_count > 0
        and (
          source_first_ordinal <> 1
          or source_final_ordinal <> source_term_count
        )
      )
    then
      raise exception 'Term signal support source term ordinals are not final and contiguous for the requested version and window.';
    end if;

    select count(*) into target_segment_count
    from public.intelligence_term_signal_refresh_segments
    where owner_id = query_owner
      and refresh_id = query_target_refresh_id;
    select count(*) into target_term_count
    from public.intelligence_term_signal_refresh_terms
    where owner_id = query_owner
      and refresh_id = query_target_refresh_id;
    if target_segment_count <> 0 or target_term_count <> 0 then
      raise exception 'Term signal support clone target is non-empty without resumable clone state.';
    end if;

    insert into public.intelligence_term_signal_support_clones (
      owner_id,
      target_refresh_id,
      source_refresh_id,
      extraction_version,
      start_date,
      end_date,
      source_segment_count,
      source_term_count,
      source_final_ordinal
    ) values (
      query_owner,
      query_target_refresh_id,
      query_source_refresh_id,
      query_extraction_version,
      query_start,
      query_end,
      source_segment_count,
      source_term_count,
      source_final_ordinal
    )
    returning * into clone_state;
  elsif clone_state.source_refresh_id is distinct from query_source_refresh_id
    or clone_state.extraction_version is distinct from query_extraction_version
    or clone_state.start_date is distinct from query_start
    or clone_state.end_date is distinct from query_end
  then
    raise exception 'Term signal support clone contract does not match its saved source, version, or window.';
  end if;

  -- Keep the source alive while a bounded clone is in progress. Ordinary term
  -- refresh cleanup only removes snapshots whose liveness timestamp is stale.
  update public.intelligence_term_signal_refresh_segments
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_source_refresh_id
    and segment_id = (
      select source_segment.segment_id
      from public.intelligence_term_signal_refresh_segments source_segment
      where source_segment.owner_id = query_owner
        and source_segment.refresh_id = query_source_refresh_id
      order by source_segment.segment_id
      limit 1
    );
  update public.intelligence_term_signal_refresh_terms
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_source_refresh_id
    and normalized_term = (
      select source_term.normalized_term
      from public.intelligence_term_signal_refresh_terms source_term
      where source_term.owner_id = query_owner
        and source_term.refresh_id = query_source_refresh_id
      order by source_term.normalized_term
      limit 1
    );

  -- Any target not created by this RPC was rejected above. On resume, counts
  -- must still match the transactionally saved cursor; otherwise fail closed.
  select count(*) into target_segment_count
  from public.intelligence_term_signal_refresh_segments
  where owner_id = query_owner
    and refresh_id = query_target_refresh_id;
  select count(*) into target_term_count
  from public.intelligence_term_signal_refresh_terms
  where owner_id = query_owner
    and refresh_id = query_target_refresh_id;
  if target_segment_count <> clone_state.copied_segment_count
    or target_term_count <> clone_state.copied_term_count
  then
    raise exception 'Term signal support clone target does not match its saved resumable cursor.';
  end if;
  if clone_state.phase = 'complete'
    and (
      clone_state.copied_segment_count <> clone_state.source_segment_count
      or clone_state.copied_term_count <> clone_state.source_term_count
    )
  then
    raise exception 'Completed term signal support clone has incomplete saved counts.';
  end if;

  if clone_state.phase = 'segments' then
    with source_batch as materialized (
      select source_segment.*
      from public.intelligence_term_signal_refresh_segments source_segment
      where source_segment.owner_id = query_owner
        and source_segment.refresh_id = query_source_refresh_id
        and (
          clone_state.last_segment_id is null
          or source_segment.segment_id > clone_state.last_segment_id
        )
      order by source_segment.segment_id
      limit bounded_batch_size
    ), inserted as (
      insert into public.intelligence_term_signal_refresh_segments (
        owner_id,
        refresh_id,
        segment_id,
        extraction_version,
        start_date,
        end_date,
        processed_at,
        created_at
      )
      select
        query_owner,
        query_target_refresh_id,
        source_batch.segment_id,
        source_batch.extraction_version,
        source_batch.start_date,
        source_batch.end_date,
        source_batch.processed_at,
        pg_catalog.now()
      from source_batch
      returning segment_id
    )
    select
      count(*),
      (array_agg(inserted.segment_id order by inserted.segment_id desc))[1]
    into copied_in_batch, batch_last_segment_id
    from inserted;

    copied_segment_in_batch := copied_in_batch;
    if copied_in_batch = 0
      and clone_state.copied_segment_count < clone_state.source_segment_count
    then
      raise exception 'Term signal support source segments changed during clone.';
    end if;
    update public.intelligence_term_signal_support_clones
    set
      copied_segment_count = copied_segment_count + copied_in_batch,
      last_segment_id = coalesce(batch_last_segment_id, last_segment_id),
      phase = case
        when copied_segment_count + copied_in_batch = source_segment_count
          then 'terms'
        else phase
      end,
      updated_at = pg_catalog.now()
    where owner_id = query_owner
      and target_refresh_id = query_target_refresh_id
    returning * into clone_state;
  elsif clone_state.phase = 'terms' then
    with source_batch as materialized (
      select source_term.*
      from public.intelligence_term_signal_refresh_terms source_term
      where source_term.owner_id = query_owner
        and source_term.refresh_id = query_source_refresh_id
        and source_term.ordinal > clone_state.last_term_ordinal
      order by source_term.ordinal
      limit bounded_batch_size
    ), inserted as (
      insert into public.intelligence_term_signal_refresh_terms (
        owner_id,
        refresh_id,
        ordinal,
        normalized_term,
        observation_count,
        extraction_version,
        start_date,
        end_date,
        created_at
      )
      select
        query_owner,
        query_target_refresh_id,
        source_batch.ordinal,
        source_batch.normalized_term,
        source_batch.observation_count,
        source_batch.extraction_version,
        source_batch.start_date,
        source_batch.end_date,
        pg_catalog.now()
      from source_batch
      returning ordinal
    )
    select count(*), coalesce(max(inserted.ordinal), 0)
    into copied_in_batch, batch_last_term_ordinal
    from inserted;

    copied_term_in_batch := copied_in_batch;
    if copied_in_batch = 0
      and clone_state.copied_term_count < clone_state.source_term_count
    then
      raise exception 'Term signal support source terms changed during clone.';
    end if;
    update public.intelligence_term_signal_support_clones
    set
      copied_term_count = copied_term_count + copied_in_batch,
      last_term_ordinal = greatest(last_term_ordinal, batch_last_term_ordinal),
      updated_at = pg_catalog.now()
    where owner_id = query_owner
      and target_refresh_id = query_target_refresh_id
    returning * into clone_state;

    if clone_state.copied_term_count = clone_state.source_term_count then
      -- Revalidate the final source and prove bidirectional equality before the
      -- target can be used as finalized support. This full check runs once;
      -- the high-cardinality copy itself always remains bounded.
      select
        count(*),
        count(*) filter (where processed_at is null),
        count(*) filter (
          where extraction_version is distinct from query_extraction_version
            or start_date is distinct from query_start
            or end_date is distinct from query_end
        )
      into
        source_segment_count,
        source_unprocessed_segment_count,
        source_invalid_segment_count
      from public.intelligence_term_signal_refresh_segments
      where owner_id = query_owner
        and refresh_id = query_source_refresh_id;
      select
        count(*),
        count(*) filter (where ordinal is null),
        count(*) filter (
          where extraction_version is distinct from query_extraction_version
            or start_date is distinct from query_start
            or end_date is distinct from query_end
        ),
        count(distinct ordinal) filter (where ordinal is not null),
        coalesce(min(ordinal), 0),
        coalesce(max(ordinal), 0)
      into
        source_term_count,
        source_unfinalized_term_count,
        source_invalid_term_count,
        source_distinct_ordinal_count,
        source_first_ordinal,
        source_final_ordinal
      from public.intelligence_term_signal_refresh_terms
      where owner_id = query_owner
        and refresh_id = query_source_refresh_id;
      if source_segment_count <> clone_state.source_segment_count
        or source_unprocessed_segment_count <> 0
        or source_invalid_segment_count <> 0
        or source_term_count <> clone_state.source_term_count
        or source_unfinalized_term_count <> 0
        or source_invalid_term_count <> 0
        or source_distinct_ordinal_count <> source_term_count
        or source_final_ordinal <> clone_state.source_final_ordinal
        or (
          source_term_count > 0
          and source_first_ordinal <> 1
        )
      then
        raise exception 'Term signal support source changed or is no longer finalized.';
      end if;

      if exists (
        select 1
        from public.intelligence_term_signal_refresh_segments target_segment
        left join public.intelligence_term_signal_refresh_segments source_segment
          on source_segment.owner_id = query_owner
         and source_segment.refresh_id = query_source_refresh_id
         and source_segment.segment_id = target_segment.segment_id
        where target_segment.owner_id = query_owner
          and target_segment.refresh_id = query_target_refresh_id
          and (
            source_segment.segment_id is null
            or target_segment.extraction_version is distinct from source_segment.extraction_version
            or target_segment.start_date is distinct from source_segment.start_date
            or target_segment.end_date is distinct from source_segment.end_date
            or target_segment.processed_at is distinct from source_segment.processed_at
          )
      ) or exists (
        select 1
        from public.intelligence_term_signal_refresh_segments source_segment
        left join public.intelligence_term_signal_refresh_segments target_segment
          on target_segment.owner_id = query_owner
         and target_segment.refresh_id = query_target_refresh_id
         and target_segment.segment_id = source_segment.segment_id
        where source_segment.owner_id = query_owner
          and source_segment.refresh_id = query_source_refresh_id
          and target_segment.segment_id is null
      ) then
        raise exception 'Term signal support target segments are not an exact clone.';
      end if;

      if exists (
        select 1
        from public.intelligence_term_signal_refresh_terms target_term
        left join public.intelligence_term_signal_refresh_terms source_term
          on source_term.owner_id = query_owner
         and source_term.refresh_id = query_source_refresh_id
         and source_term.normalized_term = target_term.normalized_term
        where target_term.owner_id = query_owner
          and target_term.refresh_id = query_target_refresh_id
          and (
            source_term.normalized_term is null
            or target_term.ordinal is distinct from source_term.ordinal
            or target_term.observation_count is distinct from source_term.observation_count
            or target_term.extraction_version is distinct from source_term.extraction_version
            or target_term.start_date is distinct from source_term.start_date
            or target_term.end_date is distinct from source_term.end_date
          )
      ) or exists (
        select 1
        from public.intelligence_term_signal_refresh_terms source_term
        left join public.intelligence_term_signal_refresh_terms target_term
          on target_term.owner_id = query_owner
         and target_term.refresh_id = query_target_refresh_id
         and target_term.normalized_term = source_term.normalized_term
        where source_term.owner_id = query_owner
          and source_term.refresh_id = query_source_refresh_id
          and target_term.normalized_term is null
      ) then
        raise exception 'Term signal support target terms are not an exact clone.';
      end if;

      update public.intelligence_term_signal_support_clones
      set phase = 'complete', updated_at = pg_catalog.now()
      where owner_id = query_owner
        and target_refresh_id = query_target_refresh_id
      returning * into clone_state;
    end if;
  elsif clone_state.phase = 'complete' then
    -- Completed calls are idempotent, but only while the exact target still
    -- exists. Count mismatches were rejected above; compare all values too.
    if exists (
      select 1
      from public.intelligence_term_signal_refresh_segments target_segment
      left join public.intelligence_term_signal_refresh_segments source_segment
        on source_segment.owner_id = query_owner
       and source_segment.refresh_id = query_source_refresh_id
       and source_segment.segment_id = target_segment.segment_id
      where target_segment.owner_id = query_owner
        and target_segment.refresh_id = query_target_refresh_id
        and (
          source_segment.segment_id is null
          or target_segment.extraction_version is distinct from source_segment.extraction_version
          or target_segment.start_date is distinct from source_segment.start_date
          or target_segment.end_date is distinct from source_segment.end_date
          or target_segment.processed_at is distinct from source_segment.processed_at
        )
    ) or exists (
      select 1
      from public.intelligence_term_signal_refresh_segments source_segment
      left join public.intelligence_term_signal_refresh_segments target_segment
        on target_segment.owner_id = query_owner
       and target_segment.refresh_id = query_target_refresh_id
       and target_segment.segment_id = source_segment.segment_id
      where source_segment.owner_id = query_owner
        and source_segment.refresh_id = query_source_refresh_id
        and target_segment.segment_id is null
    ) or exists (
      select 1
      from public.intelligence_term_signal_refresh_terms target_term
      left join public.intelligence_term_signal_refresh_terms source_term
        on source_term.owner_id = query_owner
       and source_term.refresh_id = query_source_refresh_id
       and source_term.normalized_term = target_term.normalized_term
      where target_term.owner_id = query_owner
        and target_term.refresh_id = query_target_refresh_id
        and (
          source_term.normalized_term is null
          or target_term.ordinal is distinct from source_term.ordinal
          or target_term.observation_count is distinct from source_term.observation_count
          or target_term.extraction_version is distinct from source_term.extraction_version
          or target_term.start_date is distinct from source_term.start_date
          or target_term.end_date is distinct from source_term.end_date
        )
    ) or exists (
      select 1
      from public.intelligence_term_signal_refresh_terms source_term
      left join public.intelligence_term_signal_refresh_terms target_term
        on target_term.owner_id = query_owner
       and target_term.refresh_id = query_target_refresh_id
       and target_term.normalized_term = source_term.normalized_term
      where source_term.owner_id = query_owner
        and source_term.refresh_id = query_source_refresh_id
        and target_term.normalized_term is null
    ) then
      raise exception 'Completed term signal support clone is no longer exact.';
    end if;
  else
    raise exception 'Term signal support clone has an invalid saved phase.';
  end if;

  return pg_catalog.jsonb_build_object(
    'source_refresh_id', clone_state.source_refresh_id,
    'target_refresh_id', clone_state.target_refresh_id,
    'extraction_version', clone_state.extraction_version,
    'start_date', clone_state.start_date,
    'end_date', clone_state.end_date,
    'phase', clone_state.phase,
    'complete', clone_state.phase = 'complete',
    'copied_segment_count', clone_state.copied_segment_count,
    'source_segment_count', clone_state.source_segment_count,
    'copied_term_count', clone_state.copied_term_count,
    'source_term_count', clone_state.source_term_count,
    'source_final_ordinal', clone_state.source_final_ordinal,
    'copied_segment_in_batch', copied_segment_in_batch,
    'copied_term_in_batch', copied_term_in_batch
  );
end;
$$;

revoke all on function public.clone_intelligence_term_signal_support_snapshot(
  uuid, uuid, uuid, text, date, date, integer
) from public, anon, authenticated;
grant execute on function public.clone_intelligence_term_signal_support_snapshot(
  uuid, uuid, uuid, text, date, date, integer
) to service_role;
