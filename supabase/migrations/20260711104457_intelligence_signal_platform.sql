-- Canonical, article-grain intelligence analytics for terms, themes, entities,
-- procurement lifecycles, co-occurrence, and source-balanced trend snapshots.

create table if not exists public.intelligence_source_identities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.intelligence_sources(id) on delete set null,
  channel text not null check (channel in (
    'email_newsletter', 'web_article', 'official_release', 'procurement_notice',
    'youtube_video', 'podcast_episode', 'reddit_post', 'social_post'
  )),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  normalized_name text not null check (btrim(normalized_name) <> ''),
  source_family text not null,
  normalized_family text not null,
  external_key text,
  authority_tier text not null default 'unknown' check (authority_tier in (
    'primary', 'specialist', 'aggregator', 'community', 'unknown'
  )),
  expected_cadence_days numeric(8, 2) check (
    expected_cadence_days is null or expected_cadence_days > 0
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, channel, normalized_name)
);

alter table public.documents
  add column if not exists source_identity_id uuid
    references public.intelligence_source_identities(id) on delete set null,
  add column if not exists segment_count integer not null default 0
    check (segment_count >= 0),
  add column if not exists analytics_ready_at timestamptz;

update public.documents
set source_channel = metadata ->> 'source_channel'
where source_type = 'email_newsletter'
  and metadata ? 'source_channel'
  and nullif(btrim(metadata ->> 'source_channel'), '') is not null
  and source_channel is distinct from metadata ->> 'source_channel';

create table if not exists public.intelligence_document_segments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  segment_type text not null default 'unknown' check (segment_type in (
    'editorial', 'sponsored', 'navigation', 'footer', 'unknown'
  )),
  title text,
  content_text text not null check (btrim(content_text) <> ''),
  outbound_url text,
  url_host text,
  content_hash text not null check (btrim(content_hash) <> ''),
  token_count integer not null default 0 check (token_count >= 0),
  parser_version text not null,
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  search_document tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, segment_index)
);

create or replace function public.update_intelligence_segment_search_vector()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.search_document := pg_catalog.to_tsvector(
    'english',
    pg_catalog.concat_ws(
      ' ',
      coalesce(new.title, ''),
      coalesce(new.content_text, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists update_intelligence_segment_search_vector
  on public.intelligence_document_segments;
create trigger update_intelligence_segment_search_vector
before insert or update of title, content_text
on public.intelligence_document_segments
for each row execute function public.update_intelligence_segment_search_vector();

create table if not exists public.intelligence_concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  concept_type text not null check (concept_type in (
    'keyword', 'phrase', 'theme', 'capability'
  )),
  canonical_label text not null check (btrim(canonical_label) <> ''),
  normalized_key text not null check (btrim(normalized_key) <> ''),
  domain text,
  subdomain text,
  description text,
  taxonomy_version text not null default 'signal-taxonomy-v1',
  status text not null default 'active' check (status in (
    'active', 'merged', 'suppressed'
  )),
  redirect_concept_id uuid references public.intelligence_concepts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, concept_type, normalized_key)
);

create table if not exists public.intelligence_concept_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.intelligence_concepts(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  normalized_alias text not null check (btrim(normalized_alias) <> ''),
  source text not null default 'model' check (source in (
    'model', 'rule', 'manual', 'legacy'
  )),
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  is_ambiguous boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (concept_id, normalized_alias)
);

create table if not exists public.intelligence_document_concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  association_key text not null check (btrim(association_key) <> ''),
  document_id uuid not null references public.documents(id) on delete cascade,
  segment_id uuid references public.intelligence_document_segments(id) on delete cascade,
  concept_id uuid not null references public.intelligence_concepts(id) on delete cascade,
  scope text not null check (scope in (
    'title', 'summary', 'body', 'segment_title', 'segment_body',
    'document_theme', 'event_theme', 'legacy_keyword', 'model'
  )),
  source text not null check (source in ('model', 'rule', 'manual', 'legacy')),
  mention_count integer not null default 1 check (mention_count >= 0),
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  evidence_text text,
  surface_forms text[] not null default '{}',
  extraction_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, association_key)
);

create table if not exists public.intelligence_event_concepts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  association_key text not null check (btrim(association_key) <> ''),
  event_id uuid not null references public.intelligence_events(id) on delete cascade,
  concept_id uuid not null references public.intelligence_concepts(id) on delete cascade,
  relation text not null default 'theme' check (relation in (
    'theme', 'subject', 'capability', 'requirement', 'outcome'
  )),
  source text not null check (source in ('model', 'rule', 'manual', 'legacy')),
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  evidence_text text,
  extraction_version text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, association_key)
);

alter table public.intelligence_entities
  add column if not exists status text not null default 'active'
    check (status in ('active', 'merged', 'suppressed')),
  add column if not exists redirect_entity_id uuid
    references public.intelligence_entities(id) on delete set null;

alter table public.intelligence_document_entities
  add column if not exists mention_count integer not null default 1
    check (mention_count >= 0),
  add column if not exists extraction_version text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.intelligence_event_entities
  add column if not exists confidence numeric(5, 4) not null default 0.5
    check (confidence between 0 and 1),
  add column if not exists evidence_text text,
  add column if not exists extraction_version text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.intelligence_procurement_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  case_key text not null check (btrim(case_key) <> ''),
  title text not null check (btrim(title) <> ''),
  buyer_entity_id uuid references public.intelligence_entities(id) on delete set null,
  program_entity_id uuid references public.intelligence_entities(id) on delete set null,
  system_entity_id uuid references public.intelligence_entities(id) on delete set null,
  geography text,
  country_code text,
  current_stage text not null default 'need' check (current_stage in (
    'need', 'rfi_eoi', 'tender_open', 'evaluation', 'award',
    'contract_development', 'trial_acceptance', 'deployment',
    'complete', 'cancelled'
  )),
  status text not null default 'active' check (status in (
    'active', 'stalled', 'complete', 'cancelled'
  )),
  opened_at timestamptz,
  last_transition_at timestamptz,
  amount numeric,
  currency text,
  amount_usd numeric,
  source_count integer not null default 0 check (source_count >= 0),
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, case_key)
);

create table if not exists public.intelligence_procurement_case_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.intelligence_procurement_cases(id) on delete cascade,
  event_id uuid not null references public.intelligence_events(id) on delete cascade,
  stage text not null check (stage in (
    'need', 'rfi_eoi', 'tender_open', 'evaluation', 'award',
    'contract_development', 'trial_acceptance', 'deployment',
    'complete', 'cancelled'
  )),
  transition_at timestamptz,
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  source text not null default 'rule' check (source in ('model', 'rule', 'manual')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (case_id, event_id)
);

create table if not exists public.intelligence_cooccurrence_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pair_key text not null check (btrim(pair_key) <> ''),
  subject_a_type text not null check (subject_a_type in ('concept', 'entity')),
  subject_a_id uuid not null,
  subject_b_type text not null check (subject_b_type in ('concept', 'entity')),
  subject_b_id uuid not null,
  grain text not null check (grain in ('document', 'segment', 'event_cluster')),
  channel text not null default 'all',
  period_start date not null,
  period_end date not null,
  support_count integer not null default 0 check (support_count >= 0),
  subject_a_count integer not null default 0 check (subject_a_count >= 0),
  subject_b_count integer not null default 0 check (subject_b_count >= 0),
  eligible_count integer not null default 0 check (eligible_count >= 0),
  source_count integer not null default 0 check (source_count >= 0),
  confidence numeric(12, 6) not null default 0,
  lift numeric(12, 6) not null default 0,
  jaccard numeric(12, 6) not null default 0,
  npmi numeric(12, 6) not null default 0,
  momentum numeric(12, 6) not null default 0,
  qualified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  check (period_start <= period_end),
  unique (owner_id, pair_key, grain, channel, period_start, period_end)
);

alter table public.intelligence_trend_snapshots
  add column if not exists window_type text not null default 'operating'
    check (window_type in ('weekly', 'pulse', 'operating', 'strategic')),
  add column if not exists channel text not null default 'all',
  add column if not exists eligible_document_count integer not null default 0
    check (eligible_document_count >= 0),
  add column if not exists supporting_document_count integer not null default 0
    check (supporting_document_count >= 0),
  add column if not exists mention_count integer not null default 0
    check (mention_count >= 0),
  add column if not exists baseline_document_count integer not null default 0
    check (baseline_document_count >= 0),
  add column if not exists baseline_supporting_document_count integer not null default 0
    check (baseline_supporting_document_count >= 0),
  add column if not exists baseline_event_count integer not null default 0
    check (baseline_event_count >= 0),
  add column if not exists baseline_source_count integer not null default 0
    check (baseline_source_count >= 0),
  add column if not exists publisher_concentration numeric(8, 6) not null default 0
    check (publisher_concentration between 0 and 1),
  add column if not exists effective_source_count numeric(12, 6) not null default 0
    check (effective_source_count >= 0),
  add column if not exists source_overlap numeric(8, 6) not null default 0
    check (source_overlap between 0 and 1),
  add column if not exists confidence_low numeric(8, 6) not null default 0
    check (confidence_low between 0 and 1),
  add column if not exists confidence_high numeric(8, 6) not null default 0
    check (confidence_high between 0 and 1),
  add column if not exists metric_version text not null default 'signal-metrics-v1',
  add column if not exists taxonomy_version text not null default 'signal-taxonomy-v1',
  add column if not exists extraction_version text,
  add column if not exists qualification_status text not null default 'insufficient_support'
    check (qualification_status in (
      'qualified', 'insufficient_support', 'incomplete_coverage',
      'source_concentrated', 'low_confidence'
    ));

update public.intelligence_trend_snapshots
set
  eligible_document_count = document_count,
  supporting_document_count = cluster_count,
  baseline_document_count = coalesce((metadata ->> 'baseline_document_count')::integer, 0),
  baseline_event_count = coalesce((metadata ->> 'baseline_event_count')::integer, 0),
  qualification_status = case
    when independent_source_count >= 3 and event_count >= 3 then 'qualified'
    else 'insufficient_support'
  end
where metric_version = 'signal-metrics-v1';

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.intelligence_trend_snapshots'::regclass
      and contype = 'u'
      and pg_catalog.pg_get_constraintdef(oid) ilike
        '%owner_id%trend_key%period_start%period_end%'
  loop
    execute pg_catalog.format(
      'alter table public.intelligence_trend_snapshots drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;

alter table public.intelligence_trend_snapshots
  add constraint intelligence_trend_snapshots_signal_window_key
  unique (owner_id, trend_key, window_type, channel, period_start, period_end);

create table if not exists public.intelligence_signal_snapshot_generations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  window_type text not null check (window_type in (
    'weekly', 'pulse', 'operating', 'strategic'
  )),
  channel text not null default 'all',
  period_start date not null,
  period_end date not null,
  generation_started_at timestamptz not null,
  applied_at timestamptz not null default now(),
  snapshot_count integer not null default 0 check (snapshot_count >= 0),
  primary key (owner_id, window_type, channel, period_start, period_end),
  check (period_start <= period_end)
);

create or replace function public.replace_intelligence_signal_snapshots(
  p_owner_id uuid,
  p_window_type text,
  p_channel text,
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
  result_count integer := 0;
  stale_deleted_count integer := 0;
begin
  if p_owner_id is null or p_window_type is null or p_channel is null
    or p_period_start is null or p_period_end is null
    or p_generation_started_at is null
  then
    raise exception 'Signal replacement parameters cannot be null.';
  end if;
  if p_window_type not in ('weekly', 'pulse', 'operating', 'strategic') then
    raise exception 'Unsupported signal window type: %', p_window_type;
  end if;
  if p_period_start > p_period_end then
    raise exception 'Signal period start must not be after period end.';
  end if;
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Signal replacement rows must be a JSON array.';
  end if;

  insert into public.intelligence_signal_snapshot_generations (
    owner_id, window_type, channel, period_start, period_end,
    generation_started_at, applied_at, snapshot_count
  ) values (
    p_owner_id, p_window_type, p_channel, p_period_start, p_period_end,
    '-infinity'::timestamptz, pg_catalog.clock_timestamp(), 0
  ) on conflict (owner_id, window_type, channel, period_start, period_end)
  do nothing;

  select generation_started_at
  into existing_generation
  from public.intelligence_signal_snapshot_generations
  where owner_id = p_owner_id
    and window_type = p_window_type
    and channel = p_channel
    and period_start = p_period_start
    and period_end = p_period_end
  for update;

  if existing_generation is not null
    and existing_generation > p_generation_started_at
  then
    select count(*)::integer into result_count
    from public.intelligence_trend_snapshots
    where owner_id = p_owner_id
      and window_type = p_window_type
      and channel = p_channel
      and period_start = p_period_start
      and period_end = p_period_end;
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'snapshot_count', result_count,
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
      eligible_document_count integer,
      supporting_document_count integer,
      mention_count integer,
      baseline_document_count integer,
      baseline_supporting_document_count integer,
      baseline_event_count integer,
      baseline_source_count integer,
      publisher_concentration numeric,
      effective_source_count numeric,
      source_overlap numeric,
      confidence_low numeric,
      confidence_high numeric,
      metric_version text,
      taxonomy_version text,
      extraction_version text,
      qualification_status text,
      metadata jsonb
    )
  )
  insert into public.intelligence_trend_snapshots (
    owner_id, trend_key, trend_label, domain, period_start, period_end,
    window_type, channel, document_count, cluster_count, event_count,
    independent_source_count, mention_rate, event_rate, momentum,
    source_diversity, persistence, evidence_confidence, trend_strength, novelty,
    eligible_document_count, supporting_document_count, mention_count,
    baseline_document_count, baseline_supporting_document_count,
    baseline_event_count, baseline_source_count, publisher_concentration,
    effective_source_count, source_overlap, confidence_low, confidence_high,
    metric_version, taxonomy_version, extraction_version,
    qualification_status, metadata, computed_at
  )
  select
    p_owner_id, trend_key, trend_label, domain, p_period_start, p_period_end,
    p_window_type, p_channel, document_count, cluster_count, event_count,
    independent_source_count, mention_rate, event_rate, momentum,
    source_diversity, persistence, evidence_confidence, trend_strength, novelty,
    eligible_document_count, supporting_document_count, mention_count,
    baseline_document_count, baseline_supporting_document_count,
    baseline_event_count, baseline_source_count, publisher_concentration,
    effective_source_count, source_overlap, confidence_low, confidence_high,
    metric_version, taxonomy_version, extraction_version,
    qualification_status, coalesce(metadata, '{}'::jsonb),
    p_generation_started_at
  from incoming
  on conflict (
    owner_id, trend_key, window_type, channel, period_start, period_end
  ) do update set
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
    eligible_document_count = excluded.eligible_document_count,
    supporting_document_count = excluded.supporting_document_count,
    mention_count = excluded.mention_count,
    baseline_document_count = excluded.baseline_document_count,
    baseline_supporting_document_count = excluded.baseline_supporting_document_count,
    baseline_event_count = excluded.baseline_event_count,
    baseline_source_count = excluded.baseline_source_count,
    publisher_concentration = excluded.publisher_concentration,
    effective_source_count = excluded.effective_source_count,
    source_overlap = excluded.source_overlap,
    confidence_low = excluded.confidence_low,
    confidence_high = excluded.confidence_high,
    metric_version = excluded.metric_version,
    taxonomy_version = excluded.taxonomy_version,
    extraction_version = excluded.extraction_version,
    qualification_status = excluded.qualification_status,
    metadata = excluded.metadata,
    computed_at = excluded.computed_at;

  delete from public.intelligence_trend_snapshots as snapshot
  where snapshot.owner_id = p_owner_id
    and snapshot.window_type = p_window_type
    and snapshot.channel = p_channel
    and snapshot.period_start = p_period_start
    and snapshot.period_end = p_period_end
    and not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(p_rows) as incoming(trend_key text)
      where incoming.trend_key = snapshot.trend_key
    );
  get diagnostics stale_deleted_count = row_count;

  select count(*)::integer into result_count
  from public.intelligence_trend_snapshots
  where owner_id = p_owner_id
    and window_type = p_window_type
    and channel = p_channel
    and period_start = p_period_start
    and period_end = p_period_end;

  insert into public.intelligence_signal_snapshot_generations (
    owner_id, window_type, channel, period_start, period_end,
    generation_started_at, applied_at, snapshot_count
  ) values (
    p_owner_id, p_window_type, p_channel, p_period_start, p_period_end,
    p_generation_started_at, pg_catalog.clock_timestamp(), result_count
  ) on conflict (owner_id, window_type, channel, period_start, period_end)
  do update set
    generation_started_at = excluded.generation_started_at,
    applied_at = excluded.applied_at,
    snapshot_count = excluded.snapshot_count;

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'snapshot_count', result_count,
    'stale_deleted_count', stale_deleted_count,
    'generation_started_at', p_generation_started_at
  );
end;
$$;

create index if not exists intelligence_source_identities_owner_family_idx
  on public.intelligence_source_identities (owner_id, normalized_family, channel);
create index if not exists intelligence_documents_source_identity_idx
  on public.documents (owner_id, source_identity_id, published_at desc);
create index if not exists intelligence_segments_owner_document_idx
  on public.intelligence_document_segments (owner_id, document_id, segment_index);
create index if not exists intelligence_segments_owner_published_lookup_idx
  on public.intelligence_document_segments (owner_id, segment_type, document_id);
create index if not exists intelligence_segments_search_idx
  on public.intelligence_document_segments using gin (search_document);
create index if not exists intelligence_concepts_owner_domain_idx
  on public.intelligence_concepts (owner_id, domain, concept_type, status);
create index if not exists intelligence_concept_aliases_owner_alias_idx
  on public.intelligence_concept_aliases (owner_id, normalized_alias);
create index if not exists intelligence_document_concepts_owner_concept_idx
  on public.intelligence_document_concepts (owner_id, concept_id, document_id);
create index if not exists intelligence_document_concepts_segment_idx
  on public.intelligence_document_concepts (segment_id, concept_id)
  where segment_id is not null;
create index if not exists intelligence_event_concepts_owner_concept_idx
  on public.intelligence_event_concepts (owner_id, concept_id, event_id);
create index if not exists intelligence_procurement_cases_owner_stage_idx
  on public.intelligence_procurement_cases (
    owner_id, current_stage, status, last_transition_at desc
  );
create index if not exists intelligence_case_events_owner_event_idx
  on public.intelligence_procurement_case_events (owner_id, event_id);
create index if not exists intelligence_cooccurrence_owner_period_idx
  on public.intelligence_cooccurrence_snapshots (
    owner_id, period_end desc, qualified, support_count desc
  );
create index if not exists intelligence_trends_signal_lookup_idx
  on public.intelligence_trend_snapshots (
    owner_id, window_type, channel, period_end desc,
    qualification_status, trend_strength desc
  );

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'intelligence_source_identities',
    'intelligence_document_segments',
    'intelligence_concepts',
    'intelligence_concept_aliases',
    'intelligence_document_concepts',
    'intelligence_event_concepts',
    'intelligence_procurement_cases',
    'intelligence_procurement_case_events',
    'intelligence_cooccurrence_snapshots'
  ]
  loop
    execute pg_catalog.format(
      'alter table public.%I enable row level security', table_name
    );
    execute pg_catalog.format(
      'grant select, insert, update, delete on table public.%I to authenticated',
      table_name
    );
    execute pg_catalog.format(
      'grant all on table public.%I to service_role', table_name
    );

    policy_name := 'Owners can read ' || table_name;
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I', policy_name, table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );

    policy_name := 'Owners can insert ' || table_name;
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I', policy_name, table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );

    policy_name := 'Owners can update ' || table_name;
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I', policy_name, table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );

    policy_name := 'Owners can delete ' || table_name;
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I', policy_name, table_name
    );
    execute pg_catalog.format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );
  end loop;
end
$$;

alter table public.intelligence_signal_snapshot_generations
  enable row level security;
revoke all on table public.intelligence_signal_snapshot_generations
  from public, anon, authenticated;
grant all on table public.intelligence_signal_snapshot_generations
  to service_role;

revoke all on function public.replace_intelligence_signal_snapshots(
  uuid, text, text, date, date, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.replace_intelligence_signal_snapshots(
  uuid, text, text, date, date, timestamptz, jsonb
) to service_role;

revoke all on function public.update_intelligence_segment_search_vector()
  from public, anon, authenticated;
grant execute on function public.update_intelligence_segment_search_vector()
  to service_role;
