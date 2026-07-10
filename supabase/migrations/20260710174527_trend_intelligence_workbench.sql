create extension if not exists vector with schema public;

alter table public.documents
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists original_url text,
  add column if not exists canonical_url text,
  add column if not exists url_host text,
  add column if not exists external_id text,
  add column if not exists author_name text,
  add column if not exists publisher_name text,
  add column if not exists language text,
  add column if not exists published_at timestamptz,
  add column if not exists content_text text,
  add column if not exists content_markdown text,
  add column if not exists transcript_text text,
  add column if not exists summary_short text,
  add column if not exists summary_medium text,
  add column if not exists review_status text not null default 'inbox',
  add column if not exists ingestion_status text not null default 'pending',
  add column if not exists extraction_method text,
  add column if not exists extraction_version text,
  add column if not exists content_hash text,
  add column if not exists canonical_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists quality_flags jsonb not null default '{}'::jsonb,
  add column if not exists captured_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists search_document tsvector;

update public.documents
set
  original_url = coalesce(original_url, url),
  content_text = coalesce(content_text, content),
  summary_short = coalesce(summary_short, summary),
  published_at = coalesce(published_at, ingested_at at time zone 'UTC'),
  captured_at = coalesce(captured_at, ingested_at at time zone 'UTC')
where original_url is null or content_text is null or summary_short is null or published_at is null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_type%'
  loop
    execute format('alter table public.documents drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.documents
  add constraint documents_source_type_check check (
    source_type in (
      'article', 'pdf', 'youtube_video', 'x_post', 'x_thread', 'document', 'unknown',
      'email_newsletter', 'web_article', 'official_release',
      'procurement_notice', 'podcast_episode', 'reddit_post', 'social_post'
    )
  );

create index if not exists documents_owner_published_idx
  on public.documents (owner_id, published_at desc)
  where owner_id is not null;

create unique index if not exists documents_owner_external_source_key
  on public.documents (owner_id, source_type, external_id)
  where owner_id is not null and external_id is not null;

create index if not exists documents_search_document_idx
  on public.documents using gin (search_document);

create or replace function public.update_document_search_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document := to_tsvector(
    'english',
    concat_ws(
      ' ',
      coalesce(new.title, ''),
      coalesce(new.publisher_name, ''),
      coalesce(new.summary_short, ''),
      coalesce(new.summary, ''),
      coalesce(new.content_text, ''),
      coalesce(new.content, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists update_document_search_vector on public.documents;
create trigger update_document_search_vector
before insert or update of title, publisher_name, summary_short, summary, content_text, content
on public.documents
for each row execute function public.update_document_search_vector();

update public.documents
set search_document = to_tsvector(
  'english',
  concat_ws(
    ' ',
    coalesce(title, ''),
    coalesce(publisher_name, ''),
    coalesce(summary_short, ''),
    coalesce(summary, ''),
    coalesce(content_text, ''),
    coalesce(content, '')
  )
);

alter table public.documents enable row level security;

grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;

drop policy if exists "Owners can read intelligence documents" on public.documents;
create policy "Owners can read intelligence documents"
on public.documents for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can insert intelligence documents" on public.documents;
create policy "Owners can insert intelligence documents"
on public.documents for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update intelligence documents" on public.documents;
create policy "Owners can update intelligence documents"
on public.documents for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete intelligence documents" on public.documents;
create policy "Owners can delete intelligence documents"
on public.documents for delete to authenticated
using ((select auth.uid()) = owner_id);

create table if not exists public.intelligence_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in (
    'gmail', 'rss', 'website', 'procurement_portal', 'youtube',
    'podcast', 'reddit', 'social', 'manual'
  )),
  name text not null check (btrim(name) <> ''),
  external_key text not null check (btrim(external_key) <> ''),
  status text not null default 'active' check (status in (
    'candidate', 'active', 'paused', 'excluded', 'error'
  )),
  config jsonb not null default '{}'::jsonb,
  credentials_ciphertext text,
  credentials_iv text,
  credentials_tag text,
  checkpoint jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_type, external_key)
);

create table if not exists public.intelligence_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references public.intelligence_sources(id) on delete set null,
  run_type text not null check (run_type in (
    'discovery', 'backfill', 'incremental', 'reprocess', 'digest'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'partial', 'failed', 'cancelled'
  )),
  window_start timestamptz,
  window_end timestamptz,
  checkpoint_before jsonb not null default '{}'::jsonb,
  checkpoint_after jsonb not null default '{}'::jsonb,
  discovered_count integer not null default 0 check (discovered_count >= 0),
  processed_count integer not null default 0 check (processed_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  excluded_count integer not null default 0 check (excluded_count >= 0),
  token_usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(12, 6) not null default 0,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_document_embeddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null default 0 check (chunk_index >= 0),
  content text not null check (btrim(content) <> ''),
  content_hash text not null check (btrim(content_hash) <> ''),
  embedding_model text not null,
  embedding public.halfvec(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index, content_hash)
);

create index if not exists intelligence_embeddings_owner_document_idx
  on public.intelligence_document_embeddings (owner_id, document_id);

create index if not exists intelligence_embeddings_hnsw_idx
  on public.intelligence_document_embeddings
  using hnsw (embedding public.halfvec_cosine_ops);

create table if not exists public.intelligence_clusters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cluster_type text not null default 'event' check (cluster_type in (
    'exact_duplicate', 'syndicated', 'event', 'topic'
  )),
  canonical_document_id uuid references public.documents(id) on delete set null,
  fingerprint text not null,
  title text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, cluster_type, fingerprint)
);

create table if not exists public.intelligence_cluster_documents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  cluster_id uuid not null references public.intelligence_clusters(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  similarity numeric(6, 5),
  relationship text not null default 'member' check (relationship in (
    'canonical', 'duplicate', 'syndicated', 'supporting', 'member'
  )),
  created_at timestamptz not null default now(),
  primary key (cluster_id, document_id)
);

create table if not exists public.intelligence_entities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in (
    'organization', 'government_agency', 'program', 'product_system',
    'capability_technology', 'sector', 'geography', 'alliance', 'person'
  )),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  normalized_name text not null check (btrim(normalized_name) <> ''),
  description text,
  country_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, entity_type, normalized_name)
);

create table if not exists public.intelligence_entity_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null references public.intelligence_entities(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  normalized_alias text not null check (btrim(normalized_alias) <> ''),
  source text not null default 'model' check (source in ('model', 'rule', 'manual')),
  created_at timestamptz not null default now(),
  unique (owner_id, normalized_alias)
);

create table if not exists public.intelligence_document_entities (
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  entity_id uuid not null references public.intelligence_entities(id) on delete cascade,
  role text,
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  evidence_text text,
  created_at timestamptz not null default now(),
  primary key (document_id, entity_id, role)
);

create table if not exists public.intelligence_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cluster_id uuid references public.intelligence_clusters(id) on delete set null,
  event_type text not null check (event_type in (
    'procurement_notice', 'rfi_rfp_challenge', 'award', 'funding_investment',
    'partnership', 'acquisition', 'development', 'trial_pilot', 'deployment',
    'policy_regulation', 'capacity_expansion', 'cancellation', 'other'
  )),
  lifecycle_status text not null default 'announced' check (lifecycle_status in (
    'rumored', 'announced', 'open', 'awarded', 'in_development',
    'in_trial', 'deployed', 'completed', 'cancelled', 'unknown'
  )),
  title text not null check (btrim(title) <> ''),
  summary text not null default '',
  occurred_at timestamptz,
  announced_at timestamptz,
  closes_at timestamptz,
  amount numeric,
  currency text,
  amount_usd numeric,
  geography text,
  country_code text,
  defence_relevance boolean not null default false,
  canada_allied_relevance boolean not null default false,
  confidence numeric(5, 4) not null default 0.5 check (confidence between 0 and 1),
  evidence_quality numeric(5, 4) not null default 0.5 check (evidence_quality between 0 and 1),
  review_status text not null default 'unreviewed' check (review_status in (
    'unreviewed', 'confirmed', 'corrected', 'rejected'
  )),
  extraction_model text,
  extraction_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_event_evidence (
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.intelligence_events(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  evidence_role text not null default 'supporting' check (evidence_role in (
    'primary', 'supporting', 'contradicting', 'newsletter_lead'
  )),
  evidence_text text,
  source_independence_key text,
  created_at timestamptz not null default now(),
  primary key (event_id, document_id)
);

create table if not exists public.intelligence_event_entities (
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.intelligence_events(id) on delete cascade,
  entity_id uuid not null references public.intelligence_entities(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (event_id, entity_id, role)
);

create table if not exists public.intelligence_trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  trend_key text not null,
  trend_label text not null,
  domain text not null,
  period_start date not null,
  period_end date not null,
  document_count integer not null default 0,
  cluster_count integer not null default 0,
  event_count integer not null default 0,
  independent_source_count integer not null default 0,
  mention_rate numeric(12, 6) not null default 0,
  event_rate numeric(12, 6) not null default 0,
  momentum numeric(12, 6) not null default 0,
  source_diversity numeric(8, 6) not null default 0,
  persistence numeric(8, 6) not null default 0,
  evidence_confidence numeric(8, 6) not null default 0,
  trend_strength numeric(8, 4) not null default 0 check (trend_strength between 0 and 100),
  novelty boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  unique (owner_id, trend_key, period_start, period_end)
);

create table if not exists public.intelligence_watchlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  description text not null default '',
  rules jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intelligence_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  watchlist_id uuid references public.intelligence_watchlists(id) on delete set null,
  event_id uuid references public.intelligence_events(id) on delete cascade,
  trend_snapshot_id uuid references public.intelligence_trend_snapshots(id) on delete cascade,
  severity text not null default 'info' check (severity in ('info', 'notable', 'urgent')),
  title text not null,
  summary text not null default '',
  status text not null default 'unread' check (status in ('unread', 'read', 'dismissed')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

create table if not exists public.intelligence_digests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  digest_date date not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed', 'skipped')),
  subject text not null,
  content_html text not null default '',
  content_text text not null default '',
  alert_ids uuid[] not null default '{}',
  gmail_message_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (owner_id, digest_date)
);

create index if not exists intelligence_runs_owner_created_idx
  on public.intelligence_runs (owner_id, created_at desc);
create index if not exists intelligence_events_owner_announced_idx
  on public.intelligence_events (owner_id, announced_at desc);
create index if not exists intelligence_events_owner_type_idx
  on public.intelligence_events (owner_id, event_type, announced_at desc);
create index if not exists intelligence_events_defence_idx
  on public.intelligence_events (owner_id, announced_at desc)
  where defence_relevance is true;
create index if not exists intelligence_trends_owner_period_idx
  on public.intelligence_trend_snapshots (owner_id, period_end desc, trend_strength desc);
create index if not exists intelligence_entities_owner_name_idx
  on public.intelligence_entities (owner_id, normalized_name);
create index if not exists intelligence_alerts_owner_status_idx
  on public.intelligence_alerts (owner_id, status, created_at desc);

create or replace function public.set_intelligence_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'intelligence_sources', 'intelligence_clusters', 'intelligence_entities',
    'intelligence_events', 'intelligence_watchlists'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'set_' || table_name || '_updated_at',
      table_name
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_intelligence_updated_at()',
      'set_' || table_name || '_updated_at',
      table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'intelligence_sources', 'intelligence_runs', 'intelligence_document_embeddings',
    'intelligence_clusters', 'intelligence_cluster_documents', 'intelligence_entities',
    'intelligence_entity_aliases', 'intelligence_document_entities',
    'intelligence_events', 'intelligence_event_evidence', 'intelligence_event_entities',
    'intelligence_trend_snapshots', 'intelligence_watchlists', 'intelligence_alerts',
    'intelligence_digests'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);

    execute format('drop policy if exists "Owners can select %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Owners can select %s" on public.%I for select to authenticated using ((select auth.uid()) = owner_id)',
      table_name,
      table_name
    );
    execute format('drop policy if exists "Owners can insert %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Owners can insert %s" on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id)',
      table_name,
      table_name
    );
    execute format('drop policy if exists "Owners can update %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Owners can update %s" on public.%I for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id)',
      table_name,
      table_name
    );
    execute format('drop policy if exists "Owners can delete %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Owners can delete %s" on public.%I for delete to authenticated using ((select auth.uid()) = owner_id)',
      table_name,
      table_name
    );
  end loop;
end
$$;

revoke all on function public.set_intelligence_updated_at() from public, anon, authenticated;
grant execute on function public.set_intelligence_updated_at() to service_role;

create or replace function public.match_intelligence_documents(
  query_owner uuid,
  query_embedding public.halfvec(1536),
  match_count integer default 20
)
returns table (
  document_id uuid,
  title text,
  summary_short text,
  source_type text,
  original_url text,
  published_at timestamptz,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.id,
    d.title,
    d.summary_short,
    d.source_type,
    d.original_url,
    d.published_at,
    1 - (e.embedding OPERATOR(public.<=>) query_embedding) as similarity
  from public.intelligence_document_embeddings e
  join public.documents d on d.id = e.document_id
  where e.owner_id = query_owner
  order by e.embedding OPERATOR(public.<=>) query_embedding
  limit least(greatest(match_count, 1), 100)
$$;

revoke all on function public.match_intelligence_documents(uuid, public.halfvec, integer)
  from public, anon, authenticated;
grant execute on function public.match_intelligence_documents(uuid, public.halfvec, integer)
  to service_role;
