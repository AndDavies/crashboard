-- Keep excluded boilerplate out of search and use source authority/freshness
-- only as tie breakers after exact lexical/semantic relevance.
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
      where membership.segment_id = segment.id and cluster.cluster_type = 'story'
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

revoke all on function public.hybrid_search_intelligence_segments(
  uuid, text, public.halfvec, integer, double precision, double precision, integer, double precision
) from public, anon, authenticated;

grant execute on function public.hybrid_search_intelligence_segments(
  uuid, text, public.halfvec, integer, double precision, double precision, integer, double precision
) to service_role;
