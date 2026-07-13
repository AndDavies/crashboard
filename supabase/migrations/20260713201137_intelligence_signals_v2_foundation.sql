-- Crashboard Intelligence v2: granular measurement, stable daily signals,
-- segment-level hybrid search, story membership, and isolated research data.

alter table public.intelligence_sources
  add column if not exists cohort text not null default 'measurement',
  add column if not exists measurement_active_from timestamptz,
  add column if not exists discovery_origin text,
  add column if not exists robots_status text not null default 'unknown',
  add column if not exists last_successful_fetch_at timestamptz,
  add column if not exists fetch_failure_count integer not null default 0,
  add column if not exists fetch_cooldown_until timestamptz;

alter table public.intelligence_sources
  drop constraint if exists intelligence_sources_cohort_check,
  add constraint intelligence_sources_cohort_check
    check (cohort in ('measurement', 'research')),
  drop constraint if exists intelligence_sources_robots_status_check,
  add constraint intelligence_sources_robots_status_check
    check (robots_status in ('unknown', 'allowed', 'disallowed', 'not_applicable')),
  drop constraint if exists intelligence_sources_fetch_failure_count_check,
  add constraint intelligence_sources_fetch_failure_count_check
    check (fetch_failure_count >= 0);

alter table public.intelligence_runs
  drop constraint if exists intelligence_runs_run_type_check,
  add constraint intelligence_runs_run_type_check check (run_type in (
    'discovery', 'backfill', 'incremental', 'reprocess', 'digest',
    'crawl', 'research', 'signal_refresh', 'topic_maintenance'
  ));

alter table public.intelligence_concepts
  drop constraint if exists intelligence_concepts_status_check,
  add constraint intelligence_concepts_status_check check (status in (
    'active', 'candidate', 'merged', 'suppressed'
  ));

alter table public.intelligence_clusters
  drop constraint if exists intelligence_clusters_cluster_type_check,
  add constraint intelligence_clusters_cluster_type_check check (cluster_type in (
    'exact_duplicate', 'syndicated', 'event', 'story', 'topic'
  ));

alter table public.intelligence_document_segments
  add column if not exists exclusion_reason text;

create table if not exists public.intelligence_term_observations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  observation_key text not null check (btrim(observation_key) <> ''),
  document_id uuid not null references public.documents(id) on delete cascade,
  segment_id uuid references public.intelligence_document_segments(id) on delete cascade,
  source_identity_id uuid references public.intelligence_source_identities(id) on delete set null,
  observed_on date not null,
  normalized_term text not null check (btrim(normalized_term) <> ''),
  display_term text not null check (btrim(display_term) <> ''),
  term_kind text not null check (term_kind in (
    'keyword', 'phrase', 'acronym', 'identifier'
  )),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  title_count integer not null default 0 check (title_count >= 0),
  editorial_token_count integer not null default 0 check (editorial_token_count >= 0),
  salience numeric(8, 6) not null default 0 check (salience between 0 and 1),
  extraction_version text not null,
  supporting_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, observation_key)
);

create table if not exists public.intelligence_segment_embeddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  segment_id uuid not null references public.intelligence_document_segments(id) on delete cascade,
  content_hash text not null check (btrim(content_hash) <> ''),
  embedding_model text not null,
  embedding public.halfvec(1536) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (segment_id, content_hash, embedding_model)
);

create table if not exists public.intelligence_concept_embeddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  concept_id uuid not null references public.intelligence_concepts(id) on delete cascade,
  embedding_model text not null,
  embedding public.halfvec(1536) not null,
  taxonomy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (concept_id, embedding_model, taxonomy_version)
);

create table if not exists public.intelligence_cluster_segments (
  owner_id uuid not null references auth.users(id) on delete cascade,
  cluster_id uuid not null references public.intelligence_clusters(id) on delete cascade,
  segment_id uuid not null references public.intelligence_document_segments(id) on delete cascade,
  similarity numeric(6, 5) check (similarity is null or similarity between 0 and 1),
  relationship text not null default 'member' check (relationship in (
    'canonical', 'duplicate', 'syndicated', 'supporting', 'member', 'review_candidate'
  )),
  created_at timestamptz not null default now(),
  primary key (cluster_id, segment_id)
);

create table if not exists public.intelligence_signal_daily (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  signal_key text not null check (btrim(signal_key) <> ''),
  signal_kind text not null check (signal_kind in (
    'topic', 'keyword', 'organization', 'system', 'programme'
  )),
  signal_id text not null check (btrim(signal_id) <> ''),
  signal_label text not null check (btrim(signal_label) <> ''),
  lens_keys text[] not null default '{all}',
  signal_date date not null,
  metric_version text not null default 'signals-v2.0.0',
  eligible_items integer not null default 0 check (eligible_items >= 0),
  supporting_items integer not null default 0 check (supporting_items >= 0),
  supporting_documents integer not null default 0 check (supporting_documents >= 0),
  unique_stories integer not null default 0 check (unique_stories >= 0),
  mention_count integer not null default 0 check (mention_count >= 0),
  eligible_tokens integer not null default 0 check (eligible_tokens >= 0),
  independent_source_count integer not null default 0 check (independent_source_count >= 0),
  effective_source_count numeric(12, 6) not null default 0 check (effective_source_count >= 0),
  primary_source_count integer not null default 0 check (primary_source_count >= 0),
  unique_action_count integer not null default 0 check (unique_action_count >= 0),
  raw_reach numeric(12, 8) not null default 0 check (raw_reach between 0 and 1),
  source_balanced_reach numeric(12, 8) not null default 0 check (source_balanced_reach between 0 and 1),
  mentions_per_10k numeric(14, 6) not null default 0 check (mentions_per_10k >= 0),
  momentum numeric(12, 8) not null default 0,
  acceleration numeric(12, 8) not null default 0,
  burst numeric(12, 8) not null default 0,
  persistence integer not null default 0 check (persistence >= 0),
  novelty numeric(8, 6) not null default 0 check (novelty between 0 and 1),
  confidence numeric(8, 6) not null default 0 check (confidence between 0 and 1),
  increase_probability numeric(8, 6) not null default 0.5
    check (increase_probability between 0 and 1),
  direction text not null default 'sustained' check (direction in (
    'new', 'rising', 'sustained', 'cooling'
  )),
  evidence_strength text not null default 'early' check (evidence_strength in (
    'strong', 'moderate', 'early'
  )),
  extraction_confidence numeric(8, 6) not null default 0
    check (extraction_confidence between 0 and 1),
  hidden_rank_score numeric(12, 8) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (owner_id, signal_key, signal_date, metric_version)
);

create table if not exists public.intelligence_research_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  signal_kind text not null check (signal_kind in (
    'topic', 'keyword', 'organization', 'system', 'programme'
  )),
  signal_id text not null check (btrim(signal_id) <> ''),
  signal_label text not null check (btrim(signal_label) <> ''),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'failed', 'cancelled'
  )),
  trigger_type text not null default 'manual' check (trigger_type in (
    'automatic', 'manual'
  )),
  reason text not null default '',
  query_context jsonb not null default '{}'::jsonb,
  priority integer not null default 50 check (priority between 0 and 100),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cooldown_until timestamptz,
  last_error text
);

alter table public.intelligence_sources
  add column if not exists triggering_research_lead_id uuid
    references public.intelligence_research_leads(id) on delete set null;

create table if not exists public.intelligence_research_results (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.intelligence_research_leads(id) on delete cascade,
  signal_kind text not null check (signal_kind in (
    'topic', 'keyword', 'organization', 'system', 'programme'
  )),
  signal_id text not null check (btrim(signal_id) <> ''),
  assessment text not null default 'unknown' check (assessment in (
    'supported', 'mixed', 'unsupported', 'unknown'
  )),
  what_changed text not null default '',
  why_now text not null default '',
  why_it_matters text not null default '',
  what_to_watch text not null default '',
  evidence_effect text not null default 'unchanged' check (evidence_effect in (
    'strengthened', 'weakened', 'unchanged'
  )),
  sources jsonb not null default '[]'::jsonb,
  claims jsonb not null default '[]'::jsonb,
  openai_response_id text,
  model text not null,
  estimated_cost_usd numeric(12, 6) not null default 0 check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now()
);

create index if not exists intelligence_terms_owner_day_term_idx
  on public.intelligence_term_observations (
    owner_id, observed_on desc, term_kind, normalized_term
  );
create index if not exists intelligence_terms_segment_idx
  on public.intelligence_term_observations (segment_id, normalized_term);
create index if not exists intelligence_segment_embeddings_owner_segment_idx
  on public.intelligence_segment_embeddings (owner_id, segment_id);
create index if not exists intelligence_segment_embeddings_hnsw_idx
  on public.intelligence_segment_embeddings
  using hnsw (embedding public.halfvec_cosine_ops);
create index if not exists intelligence_concept_embeddings_hnsw_idx
  on public.intelligence_concept_embeddings
  using hnsw (embedding public.halfvec_cosine_ops);
create index if not exists intelligence_cluster_segments_segment_idx
  on public.intelligence_cluster_segments (segment_id, cluster_id);
create index if not exists intelligence_signal_daily_owner_day_idx
  on public.intelligence_signal_daily (
    owner_id, signal_date desc, signal_kind, direction, hidden_rank_score desc
  );
create index if not exists intelligence_signal_daily_key_idx
  on public.intelligence_signal_daily (owner_id, signal_key, signal_date desc);
create index if not exists intelligence_signal_daily_lenses_idx
  on public.intelligence_signal_daily using gin (lens_keys);
create index if not exists intelligence_research_leads_queue_idx
  on public.intelligence_research_leads (
    owner_id, status, priority desc, created_at
  );
create index if not exists intelligence_research_results_signal_idx
  on public.intelligence_research_results (owner_id, signal_kind, signal_id, created_at desc);
create index if not exists intelligence_sources_cohort_idx
  on public.intelligence_sources (owner_id, cohort, status, measurement_active_from);

create or replace function public.hybrid_search_intelligence_segments(
  query_owner uuid,
  query_text text,
  query_embedding public.halfvec(1536),
  match_count integer default 20,
  full_text_weight double precision default 1.5,
  semantic_weight double precision default 1.0,
  rrf_k integer default 50,
  min_semantic_similarity double precision default 0.45
)
returns table (
  segment_id uuid,
  document_id uuid,
  title text,
  passage text,
  original_url text,
  canonical_url text,
  publisher_name text,
  published_at timestamptz,
  source_family text,
  authority_tier text,
  story_cluster_id uuid,
  lexical_rank bigint,
  semantic_rank bigint,
  similarity double precision,
  rrf_score double precision,
  exact_match boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with lexical as (
    select
      segment.id,
      pg_catalog.row_number() over (
        order by pg_catalog.ts_rank_cd(
          segment.search_document,
          pg_catalog.websearch_to_tsquery('english', query_text)
        ) desc,
        document.published_at desc nulls last
      ) as rank_ix
    from public.intelligence_document_segments segment
    join public.documents document on document.id = segment.document_id
    where segment.owner_id = query_owner
      and segment.segment_type in ('editorial', 'unknown')
      and segment.search_document @@ pg_catalog.websearch_to_tsquery('english', query_text)
    order by rank_ix
    limit least(greatest(match_count, 1), 50) * 3
  ),
  semantic as (
    select
      embedding.segment_id as id,
      pg_catalog.row_number() over (
        order by embedding.embedding OPERATOR(public.<=>) query_embedding
      ) as rank_ix,
      1 - (embedding.embedding OPERATOR(public.<=>) query_embedding) as similarity
    from public.intelligence_segment_embeddings embedding
    join public.intelligence_document_segments segment on segment.id = embedding.segment_id
    join public.documents document on document.id = segment.document_id
    where embedding.owner_id = query_owner
      and segment.segment_type in ('editorial', 'unknown')
      and 1 - (embedding.embedding OPERATOR(public.<=>) query_embedding)
        >= min_semantic_similarity
    order by rank_ix
    limit least(greatest(match_count, 1), 50) * 3
  ),
  fused as (
    select
      coalesce(lexical.id, semantic.id) as id,
      lexical.rank_ix as lexical_rank,
      semantic.rank_ix as semantic_rank,
      semantic.similarity,
      coalesce(full_text_weight / (rrf_k + lexical.rank_ix), 0.0) +
        coalesce(semantic_weight / (rrf_k + semantic.rank_ix), 0.0) as score
    from lexical
    full outer join semantic on semantic.id = lexical.id
  )
  select
    segment.id,
    document.id,
    coalesce(nullif(segment.title, ''), document.title),
    left(segment.content_text, 900),
    document.original_url,
    document.canonical_url,
    document.publisher_name,
    document.published_at,
    identity.source_family,
    identity.authority_tier,
    story.cluster_id,
    fused.lexical_rank,
    fused.semantic_rank,
    fused.similarity,
    fused.score + case
      when lower(coalesce(segment.title, '')) = lower(query_text) then 0.1
      when pg_catalog.strpos(
        lower(pg_catalog.concat_ws(' ', segment.title, segment.content_text)),
        lower(query_text)
      ) > 0 then 0.02
      else 0
    end,
    pg_catalog.strpos(
      lower(pg_catalog.concat_ws(' ', segment.title, segment.content_text)),
      lower(query_text)
    ) > 0
  from fused
  join public.intelligence_document_segments segment on segment.id = fused.id
  join public.documents document on document.id = segment.document_id
  left join public.intelligence_source_identities identity
    on identity.id = document.source_identity_id
  left join lateral (
    select membership.cluster_id
    from public.intelligence_cluster_segments membership
    join public.intelligence_clusters cluster on cluster.id = membership.cluster_id
    where membership.segment_id = segment.id and cluster.cluster_type = 'story'
    order by (membership.relationship = 'canonical') desc, membership.created_at
    limit 1
  ) story on true
  order by 15 desc, document.published_at desc nulls last
  limit least(greatest(match_count, 1), 50)
$$;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'intelligence_term_observations',
    'intelligence_segment_embeddings',
    'intelligence_concept_embeddings',
    'intelligence_cluster_segments',
    'intelligence_signal_daily',
    'intelligence_research_leads',
    'intelligence_research_results'
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
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );
    policy_name := 'Owners can insert ' || table_name;
    execute pg_catalog.format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );
    policy_name := 'Owners can update ' || table_name;
    execute pg_catalog.format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );
    policy_name := 'Owners can delete ' || table_name;
    execute pg_catalog.format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',
      policy_name, table_name
    );
  end loop;
end
$$;

revoke all on function public.hybrid_search_intelligence_segments(
  uuid, text, public.halfvec, integer, double precision, double precision,
  integer, double precision
) from public, anon, authenticated;
grant execute on function public.hybrid_search_intelligence_segments(
  uuid, text, public.halfvec, integer, double precision, double precision,
  integer, double precision
) to service_role;
