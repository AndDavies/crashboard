-- Crashboard Intelligence v2 production acceptance checks.
-- Read-only. Change the UUID in params when auditing another owner.

-- 1. Measurement-item coverage, segmentation, exclusions, and source families.
with
params as (
  select '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid owner_id
),
eligible_segments as (
  select
    segment.id as segment_id,
    segment.document_id,
    segment.segment_type,
    segment.parser_version,
    segment.confidence,
    segment.metadata,
    document.source_identity_id,
    nullif(btrim(identity.normalized_family), '') as normalized_family,
    source.id as source_id
  from public.intelligence_document_segments segment
  join public.documents document
    on document.id = segment.document_id
   and document.owner_id = segment.owner_id
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
  join params on params.owner_id = segment.owner_id
  where segment.segment_type in ('editorial', 'unknown')
    and segment.exclusion_reason is null
    and coalesce(document.published_at, document.created_at::timestamptz) <= now()
    and coalesce(source.cohort, document.metadata ->> 'source_cohort', 'measurement') =
      'measurement'
    and (source.id is null or source.status = 'active')
    and (
      source.measurement_active_from is null
      or coalesce(document.published_at, document.created_at::timestamptz) >=
        source.measurement_active_from
    )
),
coverage as (
  select
    eligible.*,
    (
      exists (
        select 1
        from public.intelligence_term_observations term
        where term.owner_id = (select owner_id from params)
          and term.segment_id = eligible.segment_id
          and term.extraction_version = 'terms-v2.0.0'
      )
      or exists (
        select 1
        from public.intelligence_document_concepts concept
        where concept.owner_id = (select owner_id from params)
          and concept.confidence >= 0.60
          and (
            concept.segment_id = eligible.segment_id
            or (
              concept.segment_id is null
              and concept.document_id = eligible.document_id
            )
          )
      )
      or exists (
        select 1
        from public.intelligence_document_entities entity
        where entity.owner_id = (select owner_id from params)
          and entity.confidence >= 0.60
          and entity.document_id = eligible.document_id
      )
    ) as covered
  from eligible_segments eligible
),
excluded_contributors as (
  select segment.id
  from public.intelligence_document_segments segment
  join params on params.owner_id = segment.owner_id
  where segment.exclusion_reason is not null
    and (
      exists (
        select 1 from public.intelligence_term_observations term
        where term.owner_id = segment.owner_id and term.segment_id = segment.id
      )
      or exists (
        select 1 from public.intelligence_document_concepts concept
        where concept.owner_id = segment.owner_id and concept.segment_id = segment.id
      )
      or exists (
        select 1 from public.intelligence_cluster_segments membership
        where membership.owner_id = segment.owner_id and membership.segment_id = segment.id
      )
      or exists (
        select 1 from public.intelligence_segment_embeddings embedding
        where embedding.owner_id = segment.owner_id and embedding.segment_id = segment.id
      )
    )
)
select
  count(*) as eligible_measurement_items,
  count(*) filter (where covered) as covered_items,
  round(100.0 * count(*) filter (where covered) / nullif(count(*), 0), 2) as coverage_pct,
  count(*) filter (where normalized_family is not null) as normalized_family_items,
  round(
    100.0 * count(*) filter (where normalized_family is not null) /
      nullif(count(*), 0),
    2
  ) as normalized_family_pct,
  count(*) filter (where parser_version = 'newsletter-segments-v2') as parser_v2_items,
  count(*) filter (where confidence < 0.70) as low_confidence_items,
  count(*) filter (
    where coalesce((metadata ->> 'coarse_item')::boolean, false)
  ) as coarse_items,
  (select count(*) from excluded_contributors) as excluded_items_with_v2_artifacts
from coverage;

-- Gates: coverage_pct >= 95; normalized_family_pct = 100;
-- parser_v2_items = eligible_measurement_items after the six-month rebuild;
-- excluded_items_with_v2_artifacts = 0.

-- 2. Event links, future dates, and structural deduplication.
with
params as (
  select '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid owner_id
),
usable_events as (
  select event.*
  from public.intelligence_events event
  join params on params.owner_id = event.owner_id
  where event.event_type <> 'other'
    and event.review_status <> 'rejected'
    and event.confidence >= 0.60
    and coalesce(event.announced_at, event.occurred_at, event.created_at) <= now()
),
linked_events as (
  select
    event.id,
    (
      exists (
        select 1 from public.intelligence_event_concepts concept
        where concept.owner_id = event.owner_id
          and concept.event_id = event.id
          and concept.confidence >= 0.60
      )
      or exists (
        select 1 from public.intelligence_event_entities entity
        where entity.owner_id = event.owner_id
          and entity.event_id = event.id
          and entity.confidence >= 0.60
      )
    ) as linked
  from usable_events event
),
event_cluster_sizes as (
  select event.cluster_id, count(*) as event_count
  from usable_events event
  where event.cluster_id is not null
  group by event.cluster_id
),
story_cluster_sizes as (
  select
    cluster.id,
    count(distinct document.document_id) as documents,
    count(distinct segment.segment_id) as segments
  from public.intelligence_clusters cluster
  join params on params.owner_id = cluster.owner_id
  left join public.intelligence_cluster_documents document on document.cluster_id = cluster.id
  left join public.intelligence_cluster_segments segment on segment.cluster_id = cluster.id
  where cluster.cluster_type = 'story'
  group by cluster.id
)
select
  (select count(*) from usable_events) as usable_events,
  (select count(*) from linked_events where linked) as linked_events,
  round(
    100.0 * (select count(*) from linked_events where linked) /
      nullif((select count(*) from linked_events), 0),
    2
  ) as event_link_coverage_pct,
  (
    select count(*)
    from public.intelligence_events event
    join params on params.owner_id = event.owner_id
    where event.event_type <> 'other'
      and event.review_status <> 'rejected'
      and (event.announced_at > now() or event.occurred_at > now())
  ) as future_visible_events,
  (select count(*) from event_cluster_sizes) as event_clusters,
  (select count(*) from event_cluster_sizes where event_count > 1) as deduplicated_event_clusters,
  (select count(*) from story_cluster_sizes) as story_clusters,
  (select count(*) from story_cluster_sizes where documents > 1 or segments > 1) as multi_item_story_clusters;

-- Gates: event_link_coverage_pct >= 90; future_visible_events = 0.
-- Precision/recall still require the retained labelled duplicate-pair set.

-- 3. Canonical-series validity and research-cohort isolation.
with
params as (
  select '5ff5c69e-5cb3-488a-a7ed-13067c50e85b'::uuid owner_id
),
research_documents as (
  select document.id
  from public.documents document
  left join public.intelligence_source_identities identity
    on identity.id = document.source_identity_id
   and identity.owner_id = document.owner_id
  join public.intelligence_sources source
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
  join params on params.owner_id = document.owner_id
  where source.cohort = 'research'
),
scored_documents as (
  select distinct
    daily.id as signal_row_id,
    document_id.value as document_id
  from public.intelligence_signal_daily daily
  join params on params.owner_id = daily.owner_id
  cross join lateral jsonb_array_elements_text(
    coalesce(daily.metadata -> 'documentIds', '[]'::jsonb)
  ) document_id(value)
  where daily.metric_version = 'signals-v2.0.0'
)
select
  count(*) as signal_rows,
  count(*) filter (where supporting_items > eligible_items) as support_over_denominator,
  count(*) filter (where supporting_documents > supporting_items) as documents_over_items,
  count(*) filter (where unique_stories > supporting_items) as stories_over_items,
  count(*) filter (where raw_reach < 0 or raw_reach > 1) as invalid_raw_reach,
  count(*) filter (
    where source_balanced_reach < 0 or source_balanced_reach > 1
  ) as invalid_balanced_reach,
  count(*) filter (
    where direction in ('sustained', 'rising')
      and acceleration <> 0
      and coalesce((metadata ->> 'has_twelve_complete_weeks')::boolean, false) = false
  ) as premature_acceleration_rows,
  (
    select count(*)
    from scored_documents scored
    join research_documents research on research.id::text = scored.document_id
  ) as research_documents_in_signal_scores
from public.intelligence_signal_daily daily
join params on params.owner_id = daily.owner_id
where daily.metric_version = 'signals-v2.0.0';

-- All error counts, including research_documents_in_signal_scores, must be 0.
