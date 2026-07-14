-- Keep high-cardinality term evidence in Postgres while the application builds
-- canonical signal metrics in bounded, resumable batches. Raw observations stay
-- untouched for search and future extraction improvements.

create table if not exists public.intelligence_term_signal_refresh_terms (
  owner_id uuid not null references auth.users(id) on delete cascade,
  refresh_id uuid not null,
  ordinal integer check (ordinal is null or ordinal > 0),
  normalized_term text not null check (btrim(normalized_term) <> ''),
  observation_count integer not null check (observation_count > 0),
  extraction_version text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, refresh_id, normalized_term),
  check (start_date <= end_date)
);

create unique index if not exists intelligence_term_signal_refresh_ordinal_idx
  on public.intelligence_term_signal_refresh_terms (owner_id, refresh_id, ordinal)
  where ordinal is not null;

create table if not exists public.intelligence_term_signal_refresh_segments (
  owner_id uuid not null references auth.users(id) on delete cascade,
  refresh_id uuid not null,
  segment_id uuid not null references public.intelligence_document_segments(id) on delete cascade,
  extraction_version text not null,
  start_date date not null,
  end_date date not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, refresh_id, segment_id),
  check (start_date <= end_date)
);

alter table public.intelligence_signal_daily
  add column if not exists refresh_id uuid,
  add column if not exists generation_started_at timestamptz,
  alter column metric_version set default 'signals-v2.1.0';

create or replace function public.keep_newer_intelligence_signal_generation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.generation_started_at is not null
    and (
      new.generation_started_at is null
      or new.generation_started_at < old.generation_started_at
    )
  then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_newer_intelligence_signal_generation
  on public.intelligence_signal_daily;
create trigger keep_newer_intelligence_signal_generation
before update on public.intelligence_signal_daily
for each row execute function public.keep_newer_intelligence_signal_generation();

create index if not exists intelligence_terms_signal_lookup_idx
  on public.intelligence_term_observations (
    owner_id,
    extraction_version,
    normalized_term,
    observed_on,
    segment_id
  );

create index if not exists documents_owner_created_unpublished_idx
  on public.documents (owner_id, created_at)
  where published_at is null;

create index if not exists intelligence_term_signal_refresh_created_idx
  on public.intelligence_term_signal_refresh_terms (owner_id, created_at);
create index if not exists intelligence_term_signal_refresh_liveness_idx
  on public.intelligence_term_signal_refresh_terms (owner_id, refresh_id, created_at);
create index if not exists intelligence_term_signal_segments_created_idx
  on public.intelligence_term_signal_refresh_segments (owner_id, created_at);
create index if not exists intelligence_term_signal_segments_liveness_idx
  on public.intelligence_term_signal_refresh_segments (owner_id, refresh_id, created_at);
create index if not exists intelligence_signal_daily_generation_cleanup_idx
  on public.intelligence_signal_daily (
    owner_id,
    metric_version,
    signal_date,
    (coalesce(generation_started_at, '-infinity'::timestamptz)),
    refresh_id,
    id
  );

alter table public.intelligence_term_signal_refresh_terms enable row level security;
alter table public.intelligence_term_signal_refresh_segments enable row level security;

revoke all on table public.intelligence_term_signal_refresh_terms
  from public, anon, authenticated;
grant all on table public.intelligence_term_signal_refresh_terms to service_role;
revoke all on table public.intelligence_term_signal_refresh_segments
  from public, anon, authenticated;
grant all on table public.intelligence_term_signal_refresh_segments to service_role;

create or replace function public.accumulate_intelligence_term_signal_refresh(
  query_owner uuid,
  query_refresh_id uuid,
  query_extraction_version text,
  query_start date,
  query_end date,
  query_segment_ids uuid[],
  query_batch_size integer,
  query_reset boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  processed_segment_count bigint := 0;
  remaining_segment_count bigint := 0;
  total_segment_count bigint := 0;
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

  with stale_refresh as materialized (
    select stale.refresh_id
    from public.intelligence_term_signal_refresh_terms stale
    where stale.owner_id = query_owner
      and stale.refresh_id <> query_refresh_id
    group by stale.refresh_id
    having max(stale.created_at) < pg_catalog.now() - interval '7 days'
    order by max(stale.created_at)
    limit 1
  ), doomed as materialized (
    select stale.ctid
    from public.intelligence_term_signal_refresh_terms stale
    join stale_refresh using (refresh_id)
    where stale.owner_id = query_owner
      and stale.refresh_id <> query_refresh_id
    order by stale.created_at, stale.normalized_term
    limit 2000
  )
  delete from public.intelligence_term_signal_refresh_terms stale
  using doomed
  where stale.ctid = doomed.ctid;

  with stale_refresh as materialized (
    select stale.refresh_id
    from public.intelligence_term_signal_refresh_segments stale
    where stale.owner_id = query_owner
      and stale.refresh_id <> query_refresh_id
    group by stale.refresh_id
    having max(stale.created_at) < pg_catalog.now() - interval '7 days'
    order by max(stale.created_at)
    limit 1
  ), doomed as materialized (
    select stale.ctid
    from public.intelligence_term_signal_refresh_segments stale
    join stale_refresh using (refresh_id)
    where stale.owner_id = query_owner
      and stale.refresh_id <> query_refresh_id
    order by stale.created_at, stale.segment_id
    limit 2000
  )
  delete from public.intelligence_term_signal_refresh_segments stale
  using doomed
  where stale.ctid = doomed.ctid;

  update public.intelligence_term_signal_refresh_terms
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and normalized_term = (
      select active.normalized_term
      from public.intelligence_term_signal_refresh_terms active
      where active.owner_id = query_owner and active.refresh_id = query_refresh_id
      order by active.normalized_term
      limit 1
    );
  update public.intelligence_term_signal_refresh_segments
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and segment_id = (
      select active.segment_id
      from public.intelligence_term_signal_refresh_segments active
      where active.owner_id = query_owner and active.refresh_id = query_refresh_id
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
  join public.intelligence_document_segments as segment
    on segment.id = requested.segment_id
   and segment.owner_id = query_owner
  on conflict (owner_id, refresh_id, segment_id) do nothing;

  with selected_segments as materialized (
    select refresh_segment.segment_id
    from public.intelligence_term_signal_refresh_segments as refresh_segment
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.processed_at is null
    order by refresh_segment.segment_id
    limit least(greatest(query_batch_size, 1), 1000)
    for update skip locked
  ),
  batch_support as (
    select
      observation.normalized_term,
      count(distinct observation.segment_id)::integer as observation_count
    from public.intelligence_term_observations as observation
    join selected_segments as eligible on eligible.segment_id = observation.segment_id
    where observation.owner_id = query_owner
      and observation.extraction_version = query_extraction_version
      and observation.observed_on between query_start and query_end
    group by observation.normalized_term
  ),
  upserted_terms as (
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
    from batch_support as supported
    on conflict (owner_id, refresh_id, normalized_term) do update
    set
      observation_count = public.intelligence_term_signal_refresh_terms.observation_count
        + excluded.observation_count,
      created_at = pg_catalog.now()
    returning 1
  ),
  marked_segments as (
    update public.intelligence_term_signal_refresh_segments as refresh_segment
    set processed_at = pg_catalog.now()
    from selected_segments as selected
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.segment_id = selected.segment_id
    returning 1
  )
  select count(*) into processed_segment_count from marked_segments;

  select
    count(*) filter (where processed_at is null),
    count(*)
  into remaining_segment_count, total_segment_count
  from public.intelligence_term_signal_refresh_segments
  where owner_id = query_owner and refresh_id = query_refresh_id;

  return pg_catalog.jsonb_build_object(
    'processed_segment_count', processed_segment_count,
    'remaining_segment_count', remaining_segment_count,
    'total_segment_count', total_segment_count
  );
end;
$$;

create or replace function public.finalize_intelligence_term_signal_support(
  query_owner uuid,
  query_refresh_id uuid,
  query_extraction_version text,
  query_start date,
  query_end date
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate_count bigint := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(query_owner::text || ':' || query_refresh_id::text, 0)
  );

  if exists (
    select 1
    from public.intelligence_term_signal_refresh_segments refresh_segment
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.processed_at is null
  ) then
    raise exception 'Term signal support still has unprocessed segments.';
  end if;

  delete from public.intelligence_term_signal_refresh_terms
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and observation_count < 3;

  with ordered as (
    select
      normalized_term,
      row_number() over (order by normalized_term)::integer as ordinal
    from public.intelligence_term_signal_refresh_terms
    where owner_id = query_owner
      and refresh_id = query_refresh_id
      and extraction_version = query_extraction_version
      and start_date = query_start
      and end_date = query_end
  )
  update public.intelligence_term_signal_refresh_terms as refresh_term
  set ordinal = ordered.ordinal
  from ordered
  where refresh_term.owner_id = query_owner
    and refresh_term.refresh_id = query_refresh_id
    and refresh_term.normalized_term = ordered.normalized_term;

  select count(*) into candidate_count
  from public.intelligence_term_signal_refresh_terms
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and ordinal is not null;
  return candidate_count;
end;
$$;

create or replace function public.get_intelligence_term_signal_observations(
  query_owner uuid,
  query_refresh_id uuid,
  query_extraction_version text,
  query_start date,
  query_end date,
  query_after_ordinal integer,
  query_through_ordinal integer,
  query_offset integer default 0,
  query_limit integer default 5000
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  bounded_offset integer := greatest(0, query_offset);
  bounded_limit integer := least(5000, greatest(1, query_limit));
  page_count integer := 0;
  result_rows jsonb := '[]'::jsonb;
begin
  update public.intelligence_term_signal_refresh_terms
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and normalized_term = (
      select active.normalized_term
      from public.intelligence_term_signal_refresh_terms active
      where active.owner_id = query_owner and active.refresh_id = query_refresh_id
      order by active.normalized_term
      limit 1
    );
  update public.intelligence_term_signal_refresh_segments
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and segment_id = (
      select active.segment_id
      from public.intelligence_term_signal_refresh_segments active
      where active.owner_id = query_owner and active.refresh_id = query_refresh_id
      order by active.segment_id
      limit 1
    );

  with selected_terms as materialized (
    select refresh_term.normalized_term
    from public.intelligence_term_signal_refresh_terms as refresh_term
    where refresh_term.owner_id = query_owner
      and refresh_term.refresh_id = query_refresh_id
      and refresh_term.extraction_version = query_extraction_version
      and refresh_term.start_date = query_start
      and refresh_term.end_date = query_end
      and refresh_term.ordinal > query_after_ordinal
      and refresh_term.ordinal <= query_through_ordinal
  ),
  aggregated as (
    select
      observation.segment_id,
      observation.document_id,
      observation.normalized_term,
      (array_agg(
        observation.display_term
        order by observation.salience desc, observation.display_term asc
      ))[1] as display_term,
      sum(observation.occurrence_count)::bigint as occurrence_count,
      max(observation.salience) as salience
    from selected_terms as selected
    join public.intelligence_term_observations as observation
      on observation.owner_id = query_owner
     and observation.extraction_version = query_extraction_version
     and observation.normalized_term = selected.normalized_term
     and observation.observed_on between query_start and query_end
    join public.intelligence_term_signal_refresh_segments as eligible
      on eligible.owner_id = query_owner
     and eligible.refresh_id = query_refresh_id
     and eligible.segment_id = observation.segment_id
    group by observation.segment_id, observation.document_id, observation.normalized_term
  ), page as materialized (
    select aggregated.*
    from aggregated
    order by aggregated.normalized_term, aggregated.segment_id
    offset bounded_offset
    limit bounded_limit + 1
  ), retained as (
    select page.*
    from page
    order by page.normalized_term, page.segment_id
    limit bounded_limit
  )
  select
    coalesce(
    jsonb_agg(
      jsonb_build_object(
        'segment_id', retained.segment_id,
        'document_id', retained.document_id,
        'normalized_term', retained.normalized_term,
        'display_term', retained.display_term,
        'occurrence_count', retained.occurrence_count,
        'salience', retained.salience
      )
      order by retained.normalized_term, retained.segment_id
    ),
    '[]'::jsonb
    ),
    (select count(*)::integer from page)
  into result_rows, page_count
  from retained;

  return pg_catalog.jsonb_build_object(
    'rows', result_rows,
    'has_more', page_count > bounded_limit,
    'next_offset', bounded_offset + least(page_count, bounded_limit)
  );
end;
$$;

create or replace function public.complete_intelligence_term_signal_refresh(
  query_owner uuid,
  query_refresh_id uuid,
  query_generation_started_at timestamptz,
  query_metric_version text,
  query_start date,
  query_end date,
  query_final_ordinal integer,
  query_batch_size integer default 5000
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed_count bigint := 0;
  maximum_ordinal integer := 0;
  has_more boolean := false;
  bounded_batch_size integer := least(5000, greatest(100, query_batch_size));
begin
  update public.intelligence_term_signal_refresh_terms
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and normalized_term = (
      select active.normalized_term
      from public.intelligence_term_signal_refresh_terms active
      where active.owner_id = query_owner and active.refresh_id = query_refresh_id
      order by active.normalized_term
      limit 1
    );
  update public.intelligence_term_signal_refresh_segments
  set created_at = pg_catalog.now()
  where owner_id = query_owner
    and refresh_id = query_refresh_id
    and segment_id = (
      select active.segment_id
      from public.intelligence_term_signal_refresh_segments active
      where active.owner_id = query_owner and active.refresh_id = query_refresh_id
      order by active.segment_id
      limit 1
    );

  if exists (
    select 1
    from public.intelligence_term_signal_refresh_segments refresh_segment
    where refresh_segment.owner_id = query_owner
      and refresh_segment.refresh_id = query_refresh_id
      and refresh_segment.processed_at is null
  ) then
    raise exception 'Term signal support still has unprocessed segments.';
  end if;

  if exists (
    select 1
    from public.intelligence_term_signal_refresh_terms
    where owner_id = query_owner
      and refresh_id = query_refresh_id
      and ordinal is null
  ) then
    raise exception 'Term signal support is not finalized.';
  end if;

  select coalesce(max(ordinal), 0) into maximum_ordinal
  from public.intelligence_term_signal_refresh_terms
  where owner_id = query_owner and refresh_id = query_refresh_id;
  if query_final_ordinal < maximum_ordinal then
    raise exception 'Term signal refresh stopped at %, before final ordinal %.',
      query_final_ordinal, maximum_ordinal;
  end if;

  with stale as materialized (
    select daily.id
    from public.intelligence_signal_daily daily
    where daily.owner_id = query_owner
      and daily.metric_version = query_metric_version
      and daily.signal_date between query_start and query_end
      and daily.refresh_id is distinct from query_refresh_id
      and coalesce(daily.generation_started_at, '-infinity'::timestamptz)
        <= query_generation_started_at
    limit bounded_batch_size
  )
  delete from public.intelligence_signal_daily daily
  using stale
  where daily.id = stale.id;
  get diagnostics removed_count = row_count;

  select exists (
    select 1
    from public.intelligence_signal_daily daily
    where daily.owner_id = query_owner
      and daily.metric_version = query_metric_version
      and daily.signal_date between query_start and query_end
      and daily.refresh_id is distinct from query_refresh_id
      and coalesce(daily.generation_started_at, '-infinity'::timestamptz)
        <= query_generation_started_at
  ) into has_more;

  -- Keep the small support snapshot for seven days. If the HTTP response or
  -- run-checkpoint write fails after this transaction commits, the final batch
  -- can be retried idempotently instead of forcing an archive restart.
  return pg_catalog.jsonb_build_object(
    'removed_count', removed_count,
    'has_more', has_more
  );
end;
$$;

revoke all on function public.accumulate_intelligence_term_signal_refresh(
  uuid, uuid, text, date, date, uuid[], integer, boolean
) from public, anon, authenticated;
revoke all on function public.finalize_intelligence_term_signal_support(
  uuid, uuid, text, date, date
) from public, anon, authenticated;
revoke all on function public.get_intelligence_term_signal_observations(
  uuid, uuid, text, date, date, integer, integer, integer, integer
) from public, anon, authenticated;
revoke all on function public.complete_intelligence_term_signal_refresh(
  uuid, uuid, timestamptz, text, date, date, integer, integer
) from public, anon, authenticated;

revoke all on function public.keep_newer_intelligence_signal_generation()
  from public, anon, authenticated;

grant execute on function public.accumulate_intelligence_term_signal_refresh(
  uuid, uuid, text, date, date, uuid[], integer, boolean
) to service_role;
grant execute on function public.finalize_intelligence_term_signal_support(
  uuid, uuid, text, date, date
) to service_role;
grant execute on function public.get_intelligence_term_signal_observations(
  uuid, uuid, text, date, date, integer, integer, integer, integer
) to service_role;
grant execute on function public.complete_intelligence_term_signal_refresh(
  uuid, uuid, timestamptz, text, date, date, integer, integer
) to service_role;

grant execute on function public.keep_newer_intelligence_signal_generation()
  to service_role;
