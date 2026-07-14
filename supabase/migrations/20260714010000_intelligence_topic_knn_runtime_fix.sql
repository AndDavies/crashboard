-- Keep each topic graph RPC below the serverless statement budget. The first
-- call commits only the frozen membership snapshot; later calls process at
-- most five ANN anchors. Also disambiguate the edge upsert conflict target.
create or replace function public.refresh_intelligence_topic_knn_edges(
  query_owner uuid,
  query_embedding_model text,
  query_maintenance_version text,
  query_window_start date,
  query_offset integer default 0,
  query_limit integer default 5,
  query_neighbours integer default 6,
  query_min_similarity double precision default 0.80
)
returns table (
  scanned integer,
  has_more boolean,
  next_offset integer,
  edge_count integer,
  window_start date
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  bounded_limit integer := least(
    5,
    greatest(1, query_limit)
  );
  bounded_neighbours integer := least(
    20,
    greatest(1, query_neighbours)
  );
  bounded_similarity double precision := least(
    0.99,
    greatest(0.0, query_min_similarity)
  );
  effective_offset integer;
  effective_window_start date;
  scanned_count integer;
  has_more_value boolean;
  next_offset_value integer;
  edge_count_value integer;
  vector_extension_version text;
  vector_major_version integer;
  vector_minor_version integer;
begin
  if query_owner is null then
    raise exception 'query_owner is required';
  end if;
  if nullif(pg_catalog.btrim(query_embedding_model), '') is null then
    raise exception 'query_embedding_model is required';
  end if;
  if nullif(pg_catalog.btrim(query_maintenance_version), '') is null then
    raise exception 'query_maintenance_version is required';
  end if;
  if query_window_start is null then
    raise exception 'query_window_start is required';
  end if;

  select installed_extension.extversion
  into vector_extension_version
  from pg_catalog.pg_extension installed_extension
  where installed_extension.extname = 'vector';
  if vector_extension_version is not null then
    vector_major_version := pg_catalog.split_part(vector_extension_version, '.', 1)::integer;
    vector_minor_version := pg_catalog.split_part(vector_extension_version, '.', 2)::integer;
    if vector_major_version > 0 or vector_minor_version >= 8 then
      perform pg_catalog.set_config('hnsw.iterative_scan', 'strict_order', true);
      perform pg_catalog.set_config('hnsw.max_scan_tuples', '20000', true);
      perform pg_catalog.set_config('hnsw.scan_mem_multiplier', '2', true);
    end if;
  end if;

  select build.window_start, build.next_offset
  into effective_window_start, effective_offset
  from public.intelligence_topic_knn_builds build
  where build.owner_id = query_owner
    and build.maintenance_version = query_maintenance_version
    and build.embedding_model = query_embedding_model
  for update;

  if not found then
    if greatest(0, query_offset) > 0 then
      raise exception 'Topic graph build state is missing for offset %', query_offset;
    end if;
    effective_window_start := query_window_start;
    effective_offset := 0;
    insert into public.intelligence_topic_knn_builds (
      owner_id,
      maintenance_version,
      embedding_model,
      window_start,
      next_offset,
      completed,
      updated_at
    ) values (
      query_owner,
      query_maintenance_version,
      query_embedding_model,
      effective_window_start,
      0,
      false,
      pg_catalog.now()
    );

    insert into public.intelligence_topic_knn_members (
      owner_id,
      maintenance_version,
      embedding_model,
      segment_id,
      content_hash,
      anchor_ordinal
    )
    select
      query_owner,
      query_maintenance_version,
      query_embedding_model,
      eligible.segment_id,
      eligible.content_hash,
      eligible.anchor_ordinal
    from (
      select
        embedding.segment_id,
        embedding.content_hash,
        (pg_catalog.row_number() over (
          order by embedding.segment_id
        ))::integer as anchor_ordinal
      from public.intelligence_segment_embeddings embedding
      join public.intelligence_document_segments segment
        on segment.id = embedding.segment_id
        and segment.owner_id = query_owner
        and segment.content_hash = embedding.content_hash
      join public.documents document
        on document.id = segment.document_id
        and document.owner_id = query_owner
      left join public.intelligence_source_identities identity_record
        on identity_record.id = document.source_identity_id
        and identity_record.owner_id = query_owner
      left join public.intelligence_sources source_record
        on source_record.owner_id = query_owner
        and source_record.id::text = coalesce(
          identity_record.source_id::text,
          document.metadata ->> 'source_id'
        )
      where embedding.owner_id = query_owner
        and embedding.embedding_model = query_embedding_model
        and segment.segment_type in ('editorial', 'unknown')
        and segment.exclusion_reason is null
        and coalesce(
          source_record.cohort,
          document.metadata ->> 'source_cohort',
          'measurement'
        ) = 'measurement'
        and (source_record.id is null or source_record.status = 'active')
        and (
          source_record.measurement_active_from is null
          or coalesce(document.published_at, document.created_at)
            >= source_record.measurement_active_from
        )
        and coalesce(document.published_at, document.created_at)::date
          >= effective_window_start
        and not exists (
          select 1
          from public.intelligence_document_concepts assignment
          where assignment.owner_id = query_owner
            and assignment.segment_id = segment.id
            and assignment.confidence >= 0.6
        )
    ) eligible;

    return query select
      0,
      true,
      0,
      0,
      effective_window_start;
    return;
  end if;

  with anchor_window as materialized (
    select
      member.anchor_ordinal,
      embedding.segment_id,
      embedding.embedding
    from public.intelligence_topic_knn_members member
    join public.intelligence_segment_embeddings embedding
      on embedding.owner_id = member.owner_id
      and embedding.embedding_model = member.embedding_model
      and embedding.segment_id = member.segment_id
      and embedding.content_hash = member.content_hash
    where member.owner_id = query_owner
      and member.maintenance_version = query_maintenance_version
      and member.embedding_model = query_embedding_model
      and member.anchor_ordinal > effective_offset
    order by member.anchor_ordinal
    limit bounded_limit + 1
  ),
  anchors as materialized (
    select
      anchor_window.anchor_ordinal,
      anchor_window.segment_id,
      anchor_window.embedding
    from anchor_window
    order by anchor_window.anchor_ordinal
    limit bounded_limit
  ),
  candidate_edges as materialized (
    select
      least(anchor.segment_id, neighbour.segment_id) as left_segment_id,
      greatest(anchor.segment_id, neighbour.segment_id) as right_segment_id,
      pg_catalog.max(neighbour.similarity) as similarity
    from anchors anchor
    cross join lateral (
      select
        candidate.segment_id,
        1 - (
          candidate.embedding OPERATOR(public.<=>) anchor.embedding
        ) as similarity
      from public.intelligence_segment_embeddings candidate
      join public.intelligence_topic_knn_members candidate_member
        on candidate_member.owner_id = candidate.owner_id
        and candidate_member.embedding_model = candidate.embedding_model
        and candidate_member.segment_id = candidate.segment_id
        and candidate_member.content_hash = candidate.content_hash
      where candidate.owner_id = query_owner
        and candidate.embedding_model = query_embedding_model
        and candidate.segment_id <> anchor.segment_id
        and candidate_member.maintenance_version = query_maintenance_version
      order by candidate.embedding OPERATOR(public.<=>) anchor.embedding
      limit bounded_neighbours
    ) neighbour
    where neighbour.similarity >= bounded_similarity
    group by
      least(anchor.segment_id, neighbour.segment_id),
      greatest(anchor.segment_id, neighbour.segment_id)
  ),
  written as (
    insert into public.intelligence_topic_knn_edges (
      owner_id,
      maintenance_version,
      embedding_model,
      window_start,
      left_segment_id,
      right_segment_id,
      similarity,
      updated_at
    )
    select
      query_owner,
      query_maintenance_version,
      query_embedding_model,
      effective_window_start,
      candidate_edges.left_segment_id,
      candidate_edges.right_segment_id,
      candidate_edges.similarity,
      pg_catalog.now()
    from candidate_edges
    on conflict on constraint intelligence_topic_knn_edges_pkey do update set
      similarity = greatest(
        intelligence_topic_knn_edges.similarity,
        excluded.similarity
      ),
      updated_at = excluded.updated_at
    returning 1
  )
  select
    (select pg_catalog.count(*)::integer from anchors) as scanned,
    (select pg_catalog.count(*) from anchor_window) > bounded_limit as has_more,
    coalesce(
      (select pg_catalog.max(anchor_ordinal) from anchors),
      effective_offset
    ) as next_offset,
    (select pg_catalog.count(*)::integer from written) as edge_count
  into scanned_count, has_more_value, next_offset_value, edge_count_value;

  update public.intelligence_topic_knn_builds build
  set
    next_offset = next_offset_value,
    completed = not has_more_value,
    updated_at = pg_catalog.now()
  where build.owner_id = query_owner
    and build.maintenance_version = query_maintenance_version
    and build.embedding_model = query_embedding_model;

  return query select
    scanned_count,
    has_more_value,
    next_offset_value,
    edge_count_value,
    effective_window_start;
end;
$$;

revoke all on function public.refresh_intelligence_topic_knn_edges(
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  integer,
  double precision
) from public, anon, authenticated;
grant execute on function public.refresh_intelligence_topic_knn_edges(
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  integer,
  double precision
) to service_role;
