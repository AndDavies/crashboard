-- One read-only, run-bound acceptance snapshot for Intelligence v2. The local
-- evaluator calls this function with the exact completed refresh identity. It
-- creates no data and cannot silently substitute a different window or run.

-- The acceptance query reads one immutable refresh. Keep that exact prefix
-- indexed so PostgREST does not scan superseded metrics or refreshes before it
-- evaluates the bounded date window.
create index if not exists intelligence_signal_daily_acceptance_refresh_key_idx
  on public.intelligence_signal_daily (
    owner_id,
    refresh_id,
    metric_version,
    signal_date,
    signal_key
  );

create index if not exists intelligence_signal_daily_evaluation_movement_idx
  on public.intelligence_signal_daily (
    owner_id,
    refresh_id,
    metric_version,
    signal_kind,
    direction,
    hidden_rank_score desc,
    signal_date desc,
    signal_key
  )
  where signal_kind in ('topic', 'keyword')
    and direction in ('new', 'rising', 'cooling');

create index if not exists intelligence_cluster_segments_owner_cluster_segment_idx
  on public.intelligence_cluster_segments (owner_id, cluster_id, segment_id);

create index if not exists intelligence_event_concepts_owner_event_concept_idx
  on public.intelligence_event_concepts (owner_id, event_id, concept_id);

-- Compute fixed-input stability across the complete canonical series inside
-- Postgres. Only compact fingerprints and counts cross PostgREST; the local
-- evaluator never pages through 100k+ historical signal rows.
create or replace function public.intelligence_v2_evaluation_signal_fingerprint(
  query_owner uuid,
  query_start date,
  query_complete_through date,
  query_metric_version text,
  query_refresh_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
with
pinned as materialized (
  select
    daily.signal_key,
    daily.signal_kind,
    daily.signal_label,
    daily.signal_date,
    daily.direction,
    daily.raw_reach,
    daily.hidden_rank_score
  from public.intelligence_signal_daily daily
  where daily.owner_id = query_owner
    and daily.refresh_id = query_refresh_id
    and daily.metric_version = query_metric_version
    and daily.signal_date between query_start and query_complete_through
),
full_series_components as (
  select
    pg_catalog.count(*) as row_count,
    coalesce(pg_catalog.sum(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
          E'\x1f',
          signal_key,
          signal_date::text,
          signal_label,
          direction,
          raw_reach::text,
          hidden_rank_score::text
      ),
      0
    )::numeric), 0) as hash_sum,
    coalesce(pg_catalog.bit_xor(pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        E'\x1f',
        signal_key,
        signal_date::text,
        signal_label,
        direction,
        raw_reach::text,
        hidden_rank_score::text
      ),
      1
    )), 0) as hash_xor,
    coalesce(pg_catalog.min(pg_catalog.hashtextextended(signal_key, 2)), 0) as min_key_hash,
    coalesce(pg_catalog.max(pg_catalog.hashtextextended(signal_key, 3)), 0) as max_key_hash
  from pinned
),
full_series as (
  select
    row_count,
    pg_catalog.md5(pg_catalog.concat_ws(
      E'\x1f',
      row_count::text,
      hash_sum::text,
      hash_xor::text,
      min_key_hash::text,
      max_key_hash::text
    )) as fingerprint
  from full_series_components
),
complete_day as (
  select pg_catalog.count(*) as row_count
  from pinned
  where signal_date = query_complete_through
),
topic_labels as (
  select
    pg_catalog.count(*) as row_count,
    pg_catalog.md5(coalesce(
      pg_catalog.string_agg(
        pg_catalog.md5(pg_catalog.jsonb_build_array(
          signal_key,
          signal_label
        )::text),
        '' order by signal_key
      ),
      ''
    )) as fingerprint
  from pinned
  where signal_date = query_complete_through
    and signal_kind = 'topic'
)
select pg_catalog.jsonb_build_object(
  'fingerprintVersion', 'signal-fingerprint-v2.0.0',
  'signalRowCount', full_series.row_count,
  'signalSnapshotFingerprint', full_series.fingerprint,
  'completeDaySignalCount', complete_day.row_count,
  'topicLabelCount', topic_labels.row_count,
  'topicLabelFingerprint', topic_labels.fingerprint
)
from full_series
cross join complete_day
cross join topic_labels;
$$;

revoke all on function public.intelligence_v2_evaluation_signal_fingerprint(
  uuid, date, date, text, uuid
) from public, anon, authenticated;
grant execute on function public.intelligence_v2_evaluation_signal_fingerprint(
  uuid, date, date, text, uuid
) to service_role;

create or replace function public.intelligence_v2_acceptance_snapshot(
  query_owner uuid,
  query_start date,
  query_complete_through date,
  query_metric_version text,
  query_refresh_id uuid,
  query_story_generation_id uuid,
  query_event_generation_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
with
params as materialized (
  select
    query_owner as owner_id,
    query_start as start_date,
    query_complete_through as complete_through,
    query_metric_version as metric_version,
    query_refresh_id as refresh_id,
    query_story_generation_id as story_generation_id,
    query_event_generation_id as event_generation_id
),
measurement_documents as materialized (
  select
    document.id as document_id,
    coalesce(document.published_at, document.created_at::timestamptz) as document_at,
    nullif(pg_catalog.btrim(identity.normalized_family), '') as normalized_family,
    coalesce(identity.channel, document.source_type) = 'email_newsletter' as is_newsletter,
    source.id as source_id,
    source.status as source_status,
    source.cohort as source_cohort,
    source.measurement_active_from,
    document.metadata
  from params
  join public.documents document
    on document.owner_id = params.owner_id
  left join public.intelligence_source_identities identity
    on identity.id = document.source_identity_id
   and identity.owner_id = document.owner_id
  left join public.intelligence_sources source
    on source.id = coalesce(
      identity.source_id,
      case
        when coalesce(document.metadata ->> 'source_id', '') ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (document.metadata ->> 'source_id')::uuid
        else null
      end
    )
   and source.owner_id = document.owner_id
  where coalesce(document.published_at, document.created_at::timestamptz)::date
      between params.start_date and params.complete_through
    and coalesce(source.cohort, document.metadata ->> 'source_cohort', 'measurement') =
      'measurement'
    and (source.id is null or source.status = 'active')
    and (
      source.measurement_active_from is null
      or coalesce(document.published_at, document.created_at::timestamptz) >=
        source.measurement_active_from
    )
),
eligible_segments as materialized (
  select
    segment.id as segment_id,
    segment.document_id,
    segment.parser_version,
    segment.confidence,
    segment.metadata,
    document.normalized_family,
    document.is_newsletter
  from measurement_documents document
  join public.intelligence_document_segments segment
    on segment.document_id = document.document_id
  join params on params.owner_id = segment.owner_id
  where segment.segment_type in ('editorial', 'unknown')
    and segment.exclusion_reason is null
),
eligible_documents as materialized (
  select document_id, pg_catalog.count(*) as eligible_item_count
  from eligible_segments
  group by document_id
),
coverage as materialized (
  select
    eligible.*,
    (
      exists (
        select 1
        from public.intelligence_term_observations term
        join params on params.owner_id = term.owner_id
        where term.segment_id = eligible.segment_id
          and term.extraction_version = 'terms-v2.0.0'
      )
      or exists (
        select 1
        from public.intelligence_document_concepts concept
        join params on params.owner_id = concept.owner_id
        where concept.segment_id = eligible.segment_id
          and concept.confidence >= 0.60
      )
      or (
        (select document.eligible_item_count
         from eligible_documents document
         where document.document_id = eligible.document_id) = 1
        and (
          exists (
            select 1
            from public.intelligence_document_concepts concept
            join params on params.owner_id = concept.owner_id
            where concept.document_id = eligible.document_id
              and concept.segment_id is null
              and concept.confidence >= 0.60
          )
          or exists (
            select 1
            from public.intelligence_document_entities entity
            join params on params.owner_id = entity.owner_id
            where entity.document_id = eligible.document_id
              and entity.confidence >= 0.60
          )
        )
      )
    ) as covered
  from eligible_segments eligible
),
coverage_summary as materialized (
  select
    pg_catalog.count(*) as eligible_items,
    pg_catalog.count(*) filter (where covered) as covered_items,
    100.0 * pg_catalog.count(*) filter (where covered) /
      nullif(pg_catalog.count(*), 0) as coverage_pct,
    pg_catalog.count(*) filter (where normalized_family is not null) as family_items,
    100.0 * pg_catalog.count(*) filter (where normalized_family is not null) /
      nullif(pg_catalog.count(*), 0) as family_pct,
    pg_catalog.count(*) filter (where is_newsletter) as newsletter_items,
    pg_catalog.count(*) filter (
      where is_newsletter and parser_version = 'newsletter-segments-v2'
    ) as parser_v2_newsletter_items
  from coverage
),
excluded_segments as materialized (
  select segment.id
  from public.intelligence_document_segments segment
  join public.documents document
    on document.id = segment.document_id
   and document.owner_id = segment.owner_id
  join params on params.owner_id = segment.owner_id
  where coalesce(document.published_at, document.created_at::timestamptz)::date
      between params.start_date and params.complete_through
    and (
      segment.exclusion_reason is not null
      or segment.segment_type in ('sponsored', 'navigation', 'footer')
    )
),
excluded_summary as materialized (
  select pg_catalog.count(*) as artifact_items
  from excluded_segments excluded
  where exists (
      select 1 from public.intelligence_term_observations term
      join params on params.owner_id = term.owner_id
      where term.segment_id = excluded.id
    )
    or exists (
      select 1 from public.intelligence_document_concepts concept
      join params on params.owner_id = concept.owner_id
      where concept.segment_id = excluded.id
    )
    or exists (
      select 1 from public.intelligence_cluster_segments membership
      join params on params.owner_id = membership.owner_id
      where membership.segment_id = excluded.id
    )
    or exists (
      select 1 from public.intelligence_segment_embeddings embedding
      join params on params.owner_id = embedding.owner_id
      where embedding.segment_id = excluded.id
    )
),
usable_events as materialized (
  select event.id
  from public.intelligence_events event
  join params on params.owner_id = event.owner_id
  where event.event_type <> 'other'
    and event.review_status <> 'rejected'
    and event.confidence >= 0.60
    and coalesce(event.announced_at, event.occurred_at, event.created_at)::date
      between params.start_date and params.complete_through
    and (event.announced_at is null or event.announced_at::date <= params.complete_through)
    and (event.occurred_at is null or event.occurred_at::date <= params.complete_through)
),
linked_event_ids as materialized (
  select concept.event_id
  from public.intelligence_event_concepts concept
  join usable_events event on event.id = concept.event_id
  join params on params.owner_id = concept.owner_id
  where concept.confidence >= 0.60
  union
  select entity.event_id
  from public.intelligence_event_entities entity
  join usable_events event on event.id = entity.event_id
  join params on params.owner_id = entity.owner_id
  where entity.confidence >= 0.60
),
event_summary as materialized (
  select
    (select pg_catalog.count(*) from usable_events) as usable_events,
    (select pg_catalog.count(*) from linked_event_ids) as linked_events,
    100.0 * (select pg_catalog.count(*) from linked_event_ids) /
      nullif((select pg_catalog.count(*) from usable_events), 0) as link_pct
),
pinned_signal_facts as materialized (
  select
    daily.signal_date,
    daily.eligible_items,
    daily.supporting_items,
    daily.supporting_documents,
    daily.unique_stories,
    daily.eligible_tokens,
    daily.raw_reach,
    daily.source_balanced_reach,
    daily.acceleration,
    daily.direction,
    daily.metadata ->> 'story_dedup_generation_id' as story_generation_id,
    daily.metadata ->> 'event_dedup_generation_id' as event_generation_id,
    coalesce(
      (daily.metadata ->> 'has_twelve_complete_weeks')::boolean,
      false
    ) as has_twelve_complete_weeks
  from public.intelligence_signal_daily daily
  join params on params.owner_id = daily.owner_id
  where daily.metric_version = params.metric_version
    and daily.refresh_id = params.refresh_id
    and daily.signal_date between params.start_date and params.complete_through
),
signal_action_ids as materialized (
  select distinct action.value::uuid as event_id
  from public.intelligence_signal_daily signal
  join params
    on params.owner_id = signal.owner_id
   and params.metric_version = signal.metric_version
   and params.refresh_id = signal.refresh_id
  cross join lateral pg_catalog.jsonb_array_elements_text(
    coalesce(signal.metadata -> 'actionIds', '[]'::jsonb)
  ) action(value)
  where signal.signal_date = params.complete_through
    and action.value ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
future_visible_summary as materialized (
  select pg_catalog.count(*) as future_events
  from signal_action_ids action
  join params on true
  join public.intelligence_events event
    on event.owner_id = params.owner_id
   and (event.id = action.event_id or event.cluster_id = action.event_id)
  where event.announced_at::date > params.complete_through
     or event.occurred_at::date > params.complete_through
),
series_summary as materialized (
  select
    pg_catalog.count(*) as signal_rows,
    pg_catalog.count(*) filter (where supporting_items > eligible_items) as support_errors,
    pg_catalog.count(*) filter (where supporting_documents > supporting_items) as document_errors,
    pg_catalog.count(*) filter (where unique_stories > supporting_items) as story_errors,
    pg_catalog.count(*) filter (where raw_reach < 0 or raw_reach > 1) as reach_errors,
    pg_catalog.count(*) filter (
      where source_balanced_reach < 0 or source_balanced_reach > 1
    ) as balanced_reach_errors,
    pg_catalog.count(*) filter (
      where (direction = 'sustained' or acceleration <> 0)
        and has_twelve_complete_weeks = false
    ) as premature_acceleration_errors,
    pg_catalog.count(*) filter (
      where story_generation_id is distinct from (
          select story_generation_id::text from params
        )
        or event_generation_id is distinct from (
          select event_generation_id::text from params
        )
    ) as generation_identity_errors
  from pinned_signal_facts
),
pinned_daily_totals as materialized (
  select
    total.signal_date,
    total.eligible_items,
    total.eligible_tokens
  from public.intelligence_signal_daily_totals total
  join params
    on params.owner_id = total.owner_id
   and params.metric_version = total.metric_version
   and params.refresh_id = total.refresh_id
  where total.signal_date between params.start_date and params.complete_through
),
signal_denominators as materialized (
  select
    signal_date,
    pg_catalog.count(distinct eligible_items) as item_values,
    pg_catalog.count(distinct eligible_tokens) as token_values,
    pg_catalog.min(eligible_items) as eligible_items,
    pg_catalog.min(eligible_tokens) as eligible_tokens
  from pinned_signal_facts
  group by signal_date
),
denominator_summary as materialized (
  select pg_catalog.count(*) as mismatch_days
  from signal_denominators signal
  left join pinned_daily_totals total using (signal_date)
  where signal.item_values <> 1
     or signal.token_values <> 1
     or total.signal_date is null
     or signal.eligible_items <> total.eligible_items
     or signal.eligible_tokens <> total.eligible_tokens
),
all_window_documents as materialized (
  select
    document.id,
    coalesce(document.published_at, document.created_at::timestamptz) as document_at,
    document.metadata,
    source.id as source_id,
    source.status as source_status,
    source.cohort as source_cohort,
    source.measurement_active_from
  from params
  join public.documents document on document.owner_id = params.owner_id
  left join public.intelligence_source_identities identity
    on identity.id = document.source_identity_id
   and identity.owner_id = document.owner_id
  left join public.intelligence_sources source
    on source.id = coalesce(
      identity.source_id,
      case
        when coalesce(document.metadata ->> 'source_id', '') ~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (document.metadata ->> 'source_id')::uuid
        else null
      end
    )
   and source.owner_id = document.owner_id
  where coalesce(document.published_at, document.created_at::timestamptz)::date
      between params.start_date and params.complete_through
),
ineligible_documents as materialized (
  select document.id::text as document_id
  from all_window_documents document
  where coalesce(document.source_cohort, document.metadata ->> 'source_cohort', 'measurement')
      <> 'measurement'
    or (document.source_id is not null and document.source_status <> 'active')
    or (
      document.measurement_active_from is not null
      and document.document_at < document.measurement_active_from
    )
    or (
      document.metadata ->> 'source_cohort' = 'research'
      and document.source_cohort = 'measurement'
      and document.measurement_active_from is null
    )
),
ineligible_id_set as materialized (
  select coalesce(pg_catalog.array_agg(document_id), array[]::text[]) as document_ids
  from ineligible_documents
),
research_summary as materialized (
  select
    (select pg_catalog.count(*) from ineligible_documents) as ineligible_documents,
    case
      when pg_catalog.cardinality(ids.document_ids) = 0 then 0::bigint
      else (
        select pg_catalog.count(*)
        from public.intelligence_signal_daily signal
        join params
          on params.owner_id = signal.owner_id
         and params.metric_version = signal.metric_version
         and params.refresh_id = signal.refresh_id
        where signal.signal_date between params.start_date and params.complete_through
          and coalesce(signal.metadata -> 'documentIds', '[]'::jsonb) ?|
            ids.document_ids
      )
    end as affected_signal_rows
  from ineligible_id_set ids
),
generation_summary as materialized (
  select
    exists (
      select 1 from public.intelligence_story_dedup_generations generation
      join params on params.owner_id = generation.owner_id
      where generation.generation_id = params.story_generation_id
        and generation.dedupe_version = 'story-dedup-v2.1.0'
        and generation.status = 'active'
    ) as story_generation_valid,
    exists (
      select 1 from public.intelligence_event_dedup_generations generation
      join params on params.owner_id = generation.owner_id
      where generation.generation_id = params.event_generation_id
        and generation.match_version = 'event-dedup-v2.2.4'
        and generation.status = 'active'
    ) as event_generation_valid
)
select pg_catalog.jsonb_build_object(
  'measurements', pg_catalog.jsonb_build_object(
    'eligible_measurement_items', coverage.eligible_items,
    'covered_items', coverage.covered_items,
    'coverage_pct', pg_catalog.round(coverage.coverage_pct, 2),
    'normalized_family_pct', pg_catalog.round(coverage.family_pct, 2),
    'eligible_newsletter_items', coverage.newsletter_items,
    'parser_v2_newsletter_items', coverage.parser_v2_newsletter_items,
    'excluded_items_with_v2_artifacts', excluded.artifact_items,
    'usable_events', events.usable_events,
    'linked_events', events.linked_events,
    'event_link_coverage_pct', pg_catalog.round(events.link_pct, 2),
    'future_visible_events', future.future_events,
    'signal_rows', series.signal_rows,
    'canonical_series_error_count',
      series.support_errors + series.document_errors + series.story_errors +
      series.reach_errors + series.balanced_reach_errors +
      series.premature_acceleration_errors + series.generation_identity_errors,
    'daily_denominator_mismatch_days', denominator.mismatch_days,
    'ineligible_research_documents', research.ineligible_documents,
    'signal_rows_with_ineligible_documents', research.affected_signal_rows
  ),
  'gates', pg_catalog.jsonb_build_object(
    'measurementCoverageAtLeast95Percent', coverage.coverage_pct >= 95,
    'sourceFamiliesComplete', coverage.family_pct = 100,
    'newsletterParserRebuildComplete',
      coverage.parser_v2_newsletter_items = coverage.newsletter_items,
    'excludedSegmentsIsolated', excluded.artifact_items = 0,
    'eventLinkCoverageAtLeast90Percent', events.link_pct >= 90,
    'noFutureVisibleEvents', future.future_events = 0,
    'canonicalSeriesValid',
      series.signal_rows > 0
      and series.support_errors + series.document_errors + series.story_errors +
        series.reach_errors + series.balanced_reach_errors +
        series.premature_acceleration_errors + series.generation_identity_errors = 0
      and generation.story_generation_valid
      and generation.event_generation_valid,
    'dailyDenominatorsConsistent', denominator.mismatch_days = 0,
    'researchCohortIsolated', research.affected_signal_rows = 0
  )
)
from coverage_summary coverage
cross join excluded_summary excluded
cross join event_summary events
cross join future_visible_summary future
cross join series_summary series
cross join denominator_summary denominator
cross join research_summary research
cross join generation_summary generation;
$$;

revoke all on function public.intelligence_v2_acceptance_snapshot(
  uuid, date, date, text, uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.intelligence_v2_acceptance_snapshot(
  uuid, date, date, text, uuid, uuid, uuid
) to service_role;
