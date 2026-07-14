-- Crashboard Intelligence v2 production acceptance checks.
-- Read-only: every statement below is a SELECT and creates no persistent or
-- temporary database objects.
--
-- Run each numbered statement separately. This keeps a slow or failed
-- diagnostic from consuming the timeout budget of the other gates. Before a
-- production audit, replace the UUID, start date, and complete-through date in
-- every params CTE with the exact fixed window reported by the completed signal
-- refresh. Never let the window move while an audit is in progress.
--
-- These checks deliberately use the current production indexes:
--   * segments are reached through (owner_id, document_id, segment_index)
--   * term, concept, cluster, and embedding membership is reached by segment_id
--   * event link tables are scanned once for the owner, then joined by event_id
--   * story memberships are aggregated independently before they are combined
--   * signal rows are reached through the owner/date index

-- 1. Measurement-item coverage, segmentation, and source families.
-- Resolve source eligibility once per document, then reuse the much smaller
-- eligible segment/document sets for every coverage artifact.
with
params(owner_id, start_date, complete_through, metric_version) as (
  values (
    '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid,
    date '2025-06-13',
    date '2026-07-12',
    'signals-v2.1.0'::text
  )
),
measurement_documents as materialized (
  select
    document.id as document_id,
    nullif(btrim(identity.normalized_family), '') as normalized_family,
    coalesce(identity.channel, document.source_type) = 'email_newsletter' as is_newsletter
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
    and coalesce(
      source.cohort,
      document.metadata ->> 'source_cohort',
      'measurement'
    ) = 'measurement'
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
  join params
    on params.owner_id = segment.owner_id
  where segment.segment_type in ('editorial', 'unknown')
    and segment.exclusion_reason is null
),
eligible_documents as materialized (
  select document_id, count(*) as eligible_item_count
  from eligible_segments
  group by document_id
),
coverage as (
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
)
select
  count(*) as eligible_measurement_items,
  count(*) filter (where covered) as covered_items,
  round(
    100.0 * count(*) filter (where covered) / nullif(count(*), 0),
    2
  ) as coverage_pct,
  count(*) filter (where normalized_family is not null) as normalized_family_items,
  round(
    100.0 * count(*) filter (where normalized_family is not null) /
      nullif(count(*), 0),
    2
  ) as normalized_family_pct,
  count(*) filter (where is_newsletter) as eligible_newsletter_items,
  count(*) filter (
    where is_newsletter and parser_version = 'newsletter-segments-v2'
  ) as parser_v2_newsletter_items,
  count(*) filter (where confidence < 0.70) as low_confidence_items,
  count(*) filter (
    where coalesce((metadata ->> 'coarse_item')::boolean, false)
  ) as coarse_items
from coverage;

-- Gates: coverage_pct >= 95; normalized_family_pct = 100;
-- parser_v2_newsletter_items = eligible_newsletter_items after the rebuild.
-- Document-level concepts/entities count only when the document has one eligible
-- item; multi-item newsletters require segment-level evidence.

-- 2. Excluded-segment isolation.
-- This remains a separate indexed semi-join because the excluded set should be
-- small. An excluded segment is counted once even if it has several artifacts.
with
params(owner_id, start_date, complete_through, metric_version) as (
  values (
    '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid,
    date '2025-06-13',
    date '2026-07-12',
    'signals-v2.1.0'::text
  )
),
excluded_segments as materialized (
  select segment.id
  from public.intelligence_document_segments segment
  join public.documents document
    on document.id = segment.document_id
   and document.owner_id = segment.owner_id
  join params
    on params.owner_id = segment.owner_id
  where coalesce(document.published_at, document.created_at::timestamptz)::date
      between params.start_date and params.complete_through
    and (
      segment.exclusion_reason is not null
      or segment.segment_type in ('sponsored', 'navigation', 'footer')
    )
)
select
  count(*) as excluded_items_with_v2_artifacts
from excluded_segments excluded
where exists (
    select 1
    from public.intelligence_term_observations term
    join params on params.owner_id = term.owner_id
    where term.segment_id = excluded.id
  )
  or exists (
    select 1
    from public.intelligence_document_concepts concept
    join params on params.owner_id = concept.owner_id
    where concept.segment_id = excluded.id
  )
  or exists (
    select 1
    from public.intelligence_cluster_segments membership
    join params on params.owner_id = membership.owner_id
    where membership.segment_id = excluded.id
  )
  or exists (
    select 1
    from public.intelligence_segment_embeddings embedding
    join params on params.owner_id = embedding.owner_id
    where embedding.segment_id = excluded.id
  );

-- Gate: excluded_items_with_v2_artifacts = 0.

-- 3. Event links, future dates, and event-cluster deduplication.
-- Link IDs are built once for the owner. This avoids one event-concept scan per
-- event; the current event-concept index starts with owner_id, not event_id.
with
params(owner_id, start_date, complete_through, metric_version) as (
  values (
    '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid,
    date '2025-06-13',
    date '2026-07-12',
    'signals-v2.1.0'::text
  )
),
visible_events as materialized (
  select
    event.id,
    event.cluster_id,
    event.confidence,
    event.announced_at,
    event.occurred_at,
    event.created_at
  from public.intelligence_events event
  join params
    on params.owner_id = event.owner_id
  where event.event_type <> 'other'
    and event.review_status <> 'rejected'
    and coalesce(event.announced_at, event.occurred_at, event.created_at)::date >=
      params.start_date
    and coalesce(event.announced_at, event.occurred_at, event.created_at)::date <=
      params.complete_through
    and (
      event.announced_at is null
      or event.announced_at::date <= params.complete_through
    )
    and (
      event.occurred_at is null
      or event.occurred_at::date <= params.complete_through
    )
),
usable_events as materialized (
  select event.*
  from visible_events event
  join params on true
  where event.confidence >= 0.60
    and coalesce(event.announced_at, event.occurred_at, event.created_at)::date <=
      params.complete_through
),
linked_event_ids as materialized (
  select concept.event_id
  from public.intelligence_event_concepts concept
  join usable_events event
    on event.id = concept.event_id
  join params
    on params.owner_id = concept.owner_id
  where concept.confidence >= 0.60

  union

  select entity.event_id
  from public.intelligence_event_entities entity
  join usable_events event
    on event.id = entity.event_id
  join params
    on params.owner_id = entity.owner_id
  where entity.confidence >= 0.60
),
signal_action_ids as materialized (
  select distinct action.value::uuid as action_id
  from public.intelligence_signal_daily daily
  join params
    on params.owner_id = daily.owner_id
   and params.metric_version = daily.metric_version
  cross join lateral jsonb_array_elements_text(
    coalesce(daily.metadata -> 'actionIds', '[]'::jsonb)
  ) action(value)
  where daily.signal_date between params.start_date and params.complete_through
    and action.value ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
),
future_signal_events as materialized (
  select count(*) as future_event_count
  from signal_action_ids action
  join params on true
  join public.intelligence_events event
    on event.owner_id = params.owner_id
   and (event.id = action.action_id or event.cluster_id = action.action_id)
  where event.announced_at::date > params.complete_through
     or event.occurred_at::date > params.complete_through
),
event_cluster_sizes as (
  select membership.cluster_id, count(*) as event_count
  from public.intelligence_event_cluster_memberships membership
  join public.intelligence_event_dedup_generations generation
    on generation.owner_id = membership.owner_id
   and generation.match_version = membership.match_version
   and generation.generation_id = membership.generation_id
   and generation.status = 'active'
  join usable_events event
    on event.id = membership.event_id
  join params
    on params.owner_id = membership.owner_id
  where membership.match_version = 'event-dedup-v2.2.4'
  group by membership.cluster_id
)
select
  (select count(*) from usable_events) as usable_events,
  (select count(*) from linked_event_ids) as linked_events,
  round(
    100.0 * (select count(*) from linked_event_ids) /
      nullif((select count(*) from usable_events), 0),
    2
  ) as event_link_coverage_pct,
  (select future_event_count from future_signal_events) as future_visible_events,
  (select count(*) from event_cluster_sizes) as event_clusters,
  (
    select count(*)
    from event_cluster_sizes
    where event_count > 1
  ) as deduplicated_event_clusters;

-- Gates: event_link_coverage_pct >= 90; future_visible_events = 0.
-- Precision/recall still require the retained labelled duplicate-pair set.

-- 4. Story-cluster structure.
-- Aggregate the two membership tables independently. Joining both raw tables to
-- a cluster first would create documents x segments rows for every story.
with
params(owner_id, start_date, complete_through, metric_version) as (
  values (
    '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid,
    date '2025-06-13',
    date '2026-07-12',
    'signals-v2.1.0'::text
  )
),
window_documents as materialized (
  select document.id
  from public.documents document
  join params on params.owner_id = document.owner_id
  where coalesce(document.published_at, document.created_at::timestamptz)::date
      between params.start_date and params.complete_through
),
window_segments as materialized (
  select segment.id
  from public.intelligence_document_segments segment
  join window_documents document on document.id = segment.document_id
  join params on params.owner_id = segment.owner_id
),
active_story_generation as materialized (
  select generation.generation_id
  from public.intelligence_story_dedup_generations generation
  join params on params.owner_id = generation.owner_id
  where generation.dedupe_version = 'story-dedup-v2.1.0'
    and generation.status = 'active'
),
story_clusters as materialized (
  select cluster.id
  from public.intelligence_clusters cluster
  join params
    on params.owner_id = cluster.owner_id
  join active_story_generation generation
    on cluster.metadata ->> 'story_generation_id' =
      generation.generation_id::text
  where cluster.cluster_type = 'story'
    and cluster.metadata ->> 'dedupe_version' = 'story-dedup-v2.1.0'
    and (
      exists (
        select 1
        from public.intelligence_cluster_documents membership
        join window_documents document on document.id = membership.document_id
        where membership.owner_id = params.owner_id
          and membership.cluster_id = cluster.id
      )
      or exists (
        select 1
        from public.intelligence_cluster_segments membership
        join window_segments segment on segment.id = membership.segment_id
        where membership.owner_id = params.owner_id
          and membership.cluster_id = cluster.id
      )
    )
),
document_counts as (
  select membership.cluster_id, count(*) as documents
  from public.intelligence_cluster_documents membership
  join story_clusters cluster
    on cluster.id = membership.cluster_id
  join params
    on params.owner_id = membership.owner_id
  join window_documents window_document
    on window_document.id = membership.document_id
  group by membership.cluster_id
),
segment_counts as (
  select membership.cluster_id, count(*) as segments
  from public.intelligence_cluster_segments membership
  join story_clusters cluster
    on cluster.id = membership.cluster_id
  join params
    on params.owner_id = membership.owner_id
  join window_segments window_segment
    on window_segment.id = membership.segment_id
  group by membership.cluster_id
)
select
  count(*) as story_clusters,
  count(*) filter (
    where coalesce(document.documents, 0) > 1
       or coalesce(segment.segments, 0) > 1
  ) as multi_item_story_clusters
from story_clusters cluster
left join document_counts document
  on document.cluster_id = cluster.id
left join segment_counts segment
  on segment.cluster_id = cluster.id;

-- 5. Canonical-series validity.
-- All invariants are computed in one owner-bounded pass over signal_daily.
with
params(owner_id, start_date, complete_through, metric_version) as (
  values (
    '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid,
    date '2025-06-13',
    date '2026-07-12',
    'signals-v2.1.0'::text
  )
),
pinned_signal_rows as materialized (
  select daily.*
  from public.intelligence_signal_daily daily
  join params
    on params.owner_id = daily.owner_id
   and params.metric_version = daily.metric_version
  where daily.signal_date between params.start_date and params.complete_through
),
denominator_mismatches as materialized (
  select count(*) as mismatch_days
  from (
    select signal_date
    from pinned_signal_rows
    group by signal_date
    having count(distinct eligible_items) <> 1
        or count(distinct eligible_tokens) <> 1
  ) mismatch
)
select
  count(*) as signal_rows,
  count(*) filter (
    where supporting_items > eligible_items
  ) as support_over_denominator,
  count(*) filter (
    where supporting_documents > supporting_items
  ) as documents_over_items,
  count(*) filter (
    where unique_stories > supporting_items
  ) as stories_over_items,
  count(*) filter (
    where raw_reach < 0 or raw_reach > 1
  ) as invalid_raw_reach,
  count(*) filter (
    where source_balanced_reach < 0 or source_balanced_reach > 1
  ) as invalid_balanced_reach,
  count(*) filter (
    where (direction = 'sustained' or acceleration <> 0)
      and coalesce(
        (metadata ->> 'has_twelve_complete_weeks')::boolean,
        false
      ) = false
  ) as premature_acceleration_rows,
  (select mismatch_days from denominator_mismatches) as denominator_mismatch_days
from pinned_signal_rows daily;

-- Gate: every error count after signal_rows = 0, including denominator_mismatch_days.

-- 6. Research-cohort isolation.
-- The acceptance condition is zero affected signal rows. Build the small set of
-- ineligible document IDs once and use JSONB's top-level array membership operator
-- instead of expanding and sorting every signal row's documentIds array.
with
params(owner_id, start_date, complete_through, metric_version) as (
  values (
    '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid,
    date '2025-06-13',
    date '2026-07-12',
    'signals-v2.1.0'::text
  )
),
window_documents as materialized (
  select
    document.id::text as document_id,
    coalesce(document.published_at, document.created_at::timestamptz) as document_at,
    document.metadata,
    source.id as source_id,
    source.status as source_status,
    source.cohort as source_cohort,
    source.measurement_active_from
  from public.documents document
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
  join params
    on params.owner_id = document.owner_id
  where coalesce(document.published_at, document.created_at::timestamptz)::date
      between params.start_date and params.complete_through
),
ineligible_documents as materialized (
  select document_id
  from window_documents document
  where coalesce(
      document.source_cohort,
      document.metadata ->> 'source_cohort',
      'measurement'
    ) <> 'measurement'
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
ineligible_id_set as (
  select coalesce(
    array_agg(document_id),
    array[]::text[]
  ) as document_ids
  from ineligible_documents
)
select
  (select count(*) from ineligible_documents) as ineligible_documents,
  count(*) filter (
    where coalesce(
      daily.metadata -> 'documentIds',
      '[]'::jsonb
    ) ?| ineligible.document_ids
  ) as signal_rows_with_ineligible_documents
from public.intelligence_signal_daily daily
join params
  on params.owner_id = daily.owner_id
cross join ineligible_id_set ineligible
where daily.metric_version = params.metric_version
  and daily.signal_date between params.start_date and params.complete_through;

-- Gate: signal_rows_with_ineligible_documents = 0. This catches research-cohort
-- material, inactive sources, and pre-activation documents from promoted sources.
