-- Durable completion markers for deterministic term extraction. A segment is
-- current only when its exact content hash and extraction version are present.
create table if not exists public.intelligence_term_processing_state (
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  segment_id uuid not null references public.intelligence_document_segments(id) on delete cascade,
  content_hash text not null check (btrim(content_hash) <> ''),
  extraction_version text not null check (btrim(extraction_version) <> ''),
  observation_count integer not null default 0 check (observation_count >= 0),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (segment_id, content_hash, extraction_version)
);

create index if not exists intelligence_term_state_owner_lookup_idx
  on public.intelligence_term_processing_state (
    owner_id, extraction_version, segment_id, content_hash
  );
create index if not exists intelligence_term_state_document_idx
  on public.intelligence_term_processing_state (owner_id, document_id);
create index if not exists intelligence_segments_daily_maintenance_idx
  on public.intelligence_document_segments (owner_id, updated_at, id)
  where exclusion_reason is null and segment_type in ('editorial', 'unknown');
create index if not exists intelligence_concepts_daily_maintenance_idx
  on public.intelligence_concepts (owner_id, updated_at, id)
  where status in ('active', 'candidate');

alter table public.intelligence_term_processing_state enable row level security;

grant select, insert, update, delete
  on table public.intelligence_term_processing_state to authenticated;
grant all on table public.intelligence_term_processing_state to service_role;

drop policy if exists "Owners can read intelligence_term_processing_state"
  on public.intelligence_term_processing_state;
create policy "Owners can read intelligence_term_processing_state"
  on public.intelligence_term_processing_state
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can insert intelligence_term_processing_state"
  on public.intelligence_term_processing_state;
create policy "Owners can insert intelligence_term_processing_state"
  on public.intelligence_term_processing_state
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can update intelligence_term_processing_state"
  on public.intelligence_term_processing_state;
create policy "Owners can update intelligence_term_processing_state"
  on public.intelligence_term_processing_state
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Owners can delete intelligence_term_processing_state"
  on public.intelligence_term_processing_state;
create policy "Owners can delete intelligence_term_processing_state"
  on public.intelligence_term_processing_state
  for delete to authenticated
  using ((select auth.uid()) = owner_id);
