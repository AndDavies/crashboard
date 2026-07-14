-- Failure-atomic story deduplication. A worker writes a complete, invisible
-- generation and one lease-validated transaction makes it the only readable
-- v2.1 story set. A crashed staging worker cannot change scoring or search.

create table if not exists public.intelligence_story_dedup_generations (
  generation_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  dedupe_version text not null check (btrim(dedupe_version) <> ''),
  holder_run_id uuid not null,
  expected_story_cluster_count integer not null check (
    expected_story_cluster_count >= 0
  ),
  expected_segment_membership_count integer not null check (
    expected_segment_membership_count >= 0
  ),
  expected_document_membership_count integer not null check (
    expected_document_membership_count >= 0
  ),
  expected_review_cluster_count integer not null check (
    expected_review_cluster_count >= 0
  ),
  expected_review_membership_count integer not null check (
    expected_review_membership_count >= 0
  ),
  status text not null default 'staging'
    check (status in ('staging', 'active', 'retired')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_id, dedupe_version, generation_id),
  check (
    (status = 'staging' and activated_at is null and retired_at is null)
    or (status = 'active' and activated_at is not null and retired_at is null)
    or (status = 'retired' and activated_at is not null and retired_at is not null)
  )
);

create unique index if not exists intelligence_story_dedup_generations_active_uidx
  on public.intelligence_story_dedup_generations (owner_id, dedupe_version)
  where status = 'active';
create index if not exists intelligence_story_dedup_generations_owner_created_idx
  on public.intelligence_story_dedup_generations (
    owner_id, dedupe_version, created_at desc
  );

alter table public.intelligence_story_dedup_generations enable row level security;
revoke all on table public.intelligence_story_dedup_generations
  from public, anon, authenticated;
grant select on table public.intelligence_story_dedup_generations to authenticated;
grant all on table public.intelligence_story_dedup_generations to service_role;

create policy "Owners can read intelligence_story_dedup_generations"
  on public.intelligence_story_dedup_generations
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.activate_intelligence_story_dedup_generation(
  query_owner uuid,
  query_dedupe_version text,
  query_generation_id uuid,
  query_lease_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_lease public.intelligence_signal_refresh_leases%rowtype;
  target_generation public.intelligence_story_dedup_generations%rowtype;
  actual_story_clusters bigint := 0;
  actual_segment_memberships bigint := 0;
  actual_document_memberships bigint := 0;
  actual_review_clusters bigint := 0;
  actual_review_memberships bigint := 0;
  previous_generation_id uuid;
  switched_at timestamptz := pg_catalog.clock_timestamp();
begin
  select lease.* into current_lease
  from public.intelligence_signal_refresh_leases lease
  where lease.owner_id = query_owner
  for update;
  if not found
     or current_lease.lease_token is distinct from query_lease_token
     or current_lease.expires_at <= switched_at then
    raise exception 'The story dedup activation lease is missing, expired, or not owned by this run.';
  end if;

  select generation.* into target_generation
  from public.intelligence_story_dedup_generations generation
  where generation.owner_id = query_owner
    and generation.dedupe_version = query_dedupe_version
    and generation.generation_id = query_generation_id
  for update;
  if not found then
    raise exception 'The staged story dedup generation does not exist.';
  end if;
  if target_generation.holder_run_id is distinct from current_lease.holder_run_id then
    raise exception 'The staged story dedup generation belongs to another lease holder.';
  end if;
  if target_generation.status = 'active' then
    return pg_catalog.jsonb_build_object(
      'activated', true,
      'already_active', true,
      'generation_id', query_generation_id,
      'story_cluster_count', target_generation.expected_story_cluster_count,
      'segment_membership_count', target_generation.expected_segment_membership_count,
      'document_membership_count', target_generation.expected_document_membership_count,
      'review_cluster_count', target_generation.expected_review_cluster_count,
      'review_membership_count', target_generation.expected_review_membership_count
    );
  end if;
  if target_generation.status <> 'staging' then
    raise exception 'Only a staging story dedup generation can be activated.';
  end if;

  select
    pg_catalog.count(*) filter (where cluster_row.cluster_type = 'story'),
    pg_catalog.count(*) filter (where cluster_row.cluster_type = 'story_review')
  into actual_story_clusters, actual_review_clusters
  from public.intelligence_clusters cluster_row
  where cluster_row.owner_id = query_owner
    and cluster_row.metadata ->> 'story_generation_id' = query_generation_id::text
    and (
      (
        cluster_row.cluster_type = 'story'
        and cluster_row.metadata ->> 'dedupe_version' = query_dedupe_version
      )
      or (
        cluster_row.cluster_type = 'story_review'
        and cluster_row.metadata ->> 'dedupe_version' = 'story-review-v2.1.0'
      )
    );

  select pg_catalog.count(*) into actual_segment_memberships
  from public.intelligence_cluster_segments membership
  join public.intelligence_clusters cluster_row
    on cluster_row.owner_id = membership.owner_id
   and cluster_row.id = membership.cluster_id
  where membership.owner_id = query_owner
    and cluster_row.cluster_type = 'story'
    and cluster_row.metadata ->> 'dedupe_version' = query_dedupe_version
    and cluster_row.metadata ->> 'story_generation_id' = query_generation_id::text;

  select pg_catalog.count(*) into actual_document_memberships
  from public.intelligence_cluster_documents membership
  join public.intelligence_clusters cluster_row
    on cluster_row.owner_id = membership.owner_id
   and cluster_row.id = membership.cluster_id
  where membership.owner_id = query_owner
    and cluster_row.cluster_type = 'story'
    and cluster_row.metadata ->> 'dedupe_version' = query_dedupe_version
    and cluster_row.metadata ->> 'story_generation_id' = query_generation_id::text;

  select pg_catalog.count(*) into actual_review_memberships
  from public.intelligence_cluster_segments membership
  join public.intelligence_clusters cluster_row
    on cluster_row.owner_id = membership.owner_id
   and cluster_row.id = membership.cluster_id
  where membership.owner_id = query_owner
    and cluster_row.cluster_type = 'story_review'
    and cluster_row.metadata ->> 'dedupe_version' = 'story-review-v2.1.0'
    and cluster_row.metadata ->> 'story_generation_id' = query_generation_id::text;

  if actual_story_clusters <> target_generation.expected_story_cluster_count
     or actual_segment_memberships <> target_generation.expected_segment_membership_count
     or actual_document_memberships <> target_generation.expected_document_membership_count
     or actual_review_clusters <> target_generation.expected_review_cluster_count
     or actual_review_memberships <> target_generation.expected_review_membership_count then
    raise exception
      'Incomplete story dedup generation: expected % stories/% segment memberships/% document memberships/% review clusters/% review memberships, found %/%/%/%/%.',
      target_generation.expected_story_cluster_count,
      target_generation.expected_segment_membership_count,
      target_generation.expected_document_membership_count,
      target_generation.expected_review_cluster_count,
      target_generation.expected_review_membership_count,
      actual_story_clusters,
      actual_segment_memberships,
      actual_document_memberships,
      actual_review_clusters,
      actual_review_memberships;
  end if;

  if exists (
    select 1
    from public.intelligence_clusters cluster_row
    left join public.intelligence_cluster_segments segment_membership
      on segment_membership.owner_id = cluster_row.owner_id
     and segment_membership.cluster_id = cluster_row.id
    left join public.intelligence_cluster_documents document_membership
      on document_membership.owner_id = cluster_row.owner_id
     and document_membership.cluster_id = cluster_row.id
    where cluster_row.owner_id = query_owner
      and cluster_row.cluster_type = 'story'
      and cluster_row.metadata ->> 'dedupe_version' = query_dedupe_version
      and cluster_row.metadata ->> 'story_generation_id' = query_generation_id::text
    group by cluster_row.id, cluster_row.metadata
    having pg_catalog.count(distinct segment_membership.segment_id)
        <> (cluster_row.metadata ->> 'member_count')::integer
      or pg_catalog.count(distinct segment_membership.segment_id) filter (
        where segment_membership.relationship = 'canonical'
      ) <> 1
      or pg_catalog.count(distinct document_membership.document_id) = 0
      or pg_catalog.count(distinct document_membership.document_id) filter (
        where document_membership.relationship = 'canonical'
      ) <> 1
  ) then
    raise exception 'The staged story dedup generation contains an incomplete story cluster.';
  end if;

  if exists (
    select 1
    from public.intelligence_clusters cluster_row
    left join public.intelligence_cluster_segments membership
      on membership.owner_id = cluster_row.owner_id
     and membership.cluster_id = cluster_row.id
    where cluster_row.owner_id = query_owner
      and cluster_row.cluster_type = 'story_review'
      and cluster_row.metadata ->> 'dedupe_version' = 'story-review-v2.1.0'
      and cluster_row.metadata ->> 'story_generation_id' = query_generation_id::text
    group by cluster_row.id
    having pg_catalog.count(distinct membership.segment_id) <> 2
      or pg_catalog.count(distinct membership.segment_id) filter (
        where membership.relationship = 'review_candidate'
      ) <> 2
  ) then
    raise exception 'The staged story dedup generation contains an incomplete review cluster.';
  end if;

  select generation.generation_id into previous_generation_id
  from public.intelligence_story_dedup_generations generation
  where generation.owner_id = query_owner
    and generation.dedupe_version = query_dedupe_version
    and generation.status = 'active'
  for update;

  update public.intelligence_story_dedup_generations
  set status = 'retired', retired_at = switched_at, updated_at = switched_at
  where owner_id = query_owner
    and dedupe_version = query_dedupe_version
    and status = 'active'
    and generation_id <> query_generation_id;
  update public.intelligence_story_dedup_generations
  set
    status = 'active',
    activated_at = switched_at,
    retired_at = null,
    updated_at = switched_at
  where owner_id = query_owner
    and dedupe_version = query_dedupe_version
    and generation_id = query_generation_id
    and status = 'staging';
  if not found then
    raise exception 'The staged story dedup generation could not be promoted.';
  end if;

  return pg_catalog.jsonb_build_object(
    'activated', true,
    'already_active', false,
    'generation_id', query_generation_id,
    'previous_generation_id', previous_generation_id,
    'dedupe_version', query_dedupe_version,
    'story_cluster_count', actual_story_clusters,
    'segment_membership_count', actual_segment_memberships,
    'document_membership_count', actual_document_memberships,
    'review_cluster_count', actual_review_clusters,
    'review_membership_count', actual_review_memberships,
    'activated_at', switched_at
  );
end;
$$;

revoke all on function public.activate_intelligence_story_dedup_generation(
  uuid, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.activate_intelligence_story_dedup_generation(
  uuid, text, uuid, uuid
) to service_role;

-- Search must collapse against the active story generation. Before the first
-- v2.1 activation, the legacy v2.0 set remains readable for rolling deploys.
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
  with active_story as (
    select generation_id, dedupe_version
    from public.intelligence_story_dedup_generations
    where owner_id = query_owner
      and status = 'active'
      and dedupe_version = 'story-dedup-v2.1.0'
  ),
  lexical as (
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
      and segment.exclusion_reason is null
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
      and segment.exclusion_reason is null
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
  ),
  ranked as (
    select
      segment.id as segment_id,
      document.id as document_id,
      coalesce(nullif(segment.title, ''), document.title) as title,
      left(segment.content_text, 900) as passage,
      document.original_url,
      document.canonical_url,
      document.publisher_name,
      document.published_at,
      identity.source_family,
      identity.authority_tier,
      story.cluster_id as story_cluster_id,
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
      end as rrf_score,
      pg_catalog.strpos(
        lower(pg_catalog.concat_ws(' ', segment.title, segment.content_text)),
        lower(query_text)
      ) > 0 as exact_match,
      case identity.authority_tier
        when 'primary' then 3
        when 'established' then 2
        when 'community' then 1
        else 0
      end as authority_rank
    from fused
    join public.intelligence_document_segments segment on segment.id = fused.id
    join public.documents document on document.id = segment.document_id
    left join public.intelligence_source_identities identity
      on identity.id = document.source_identity_id
    left join lateral (
      select membership.cluster_id
      from public.intelligence_cluster_segments membership
      join public.intelligence_clusters cluster on cluster.id = membership.cluster_id
      where membership.segment_id = segment.id
        and membership.owner_id = query_owner
        and cluster.owner_id = query_owner
        and cluster.cluster_type = 'story'
        and (
          (
            exists (select 1 from active_story)
            and cluster.metadata ->> 'dedupe_version' = (
              select dedupe_version from active_story limit 1
            )
            and cluster.metadata ->> 'story_generation_id' = (
              select generation_id::text from active_story limit 1
            )
          )
          or (
            not exists (select 1 from active_story)
            and cluster.metadata ->> 'dedupe_version' = 'story-dedup-v2.0.0'
            and not pg_catalog.jsonb_exists(
              cluster.metadata,
              'story_generation_id'
            )
          )
        )
      order by (membership.relationship = 'canonical') desc, membership.created_at
      limit 1
    ) story on true
  )
  select
    ranked.segment_id,
    ranked.document_id,
    ranked.title,
    ranked.passage,
    ranked.original_url,
    ranked.canonical_url,
    ranked.publisher_name,
    ranked.published_at,
    ranked.source_family,
    ranked.authority_tier,
    ranked.story_cluster_id,
    ranked.lexical_rank,
    ranked.semantic_rank,
    ranked.similarity,
    ranked.rrf_score,
    ranked.exact_match
  from ranked
  order by
    ranked.rrf_score desc,
    ranked.authority_rank desc,
    ranked.published_at desc nulls last
  limit least(greatest(match_count, 1), 50)
$$;
