-- Persist bounded pgvector k-nearest-neighbour edges so topic discovery can
-- resume between serverless calls without splitting components at page edges.
create table if not exists public.intelligence_topic_knn_builds (
  owner_id uuid not null references auth.users(id) on delete cascade,
  maintenance_version text not null check (btrim(maintenance_version) <> ''),
  embedding_model text not null check (btrim(embedding_model) <> ''),
  window_start date not null,
  next_offset integer not null default 0 check (next_offset >= 0),
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, maintenance_version, embedding_model)
);

alter table public.intelligence_topic_knn_builds enable row level security;
revoke all on table public.intelligence_topic_knn_builds
  from public, anon, authenticated;
grant all on table public.intelligence_topic_knn_builds to service_role;

-- Freeze every eligible segment before paging the graph. Mutable concept
-- assignments or newly-arrived segments therefore cannot shift later pages.
create table if not exists public.intelligence_topic_knn_members (
  owner_id uuid not null,
  maintenance_version text not null check (btrim(maintenance_version) <> ''),
  embedding_model text not null check (btrim(embedding_model) <> ''),
  segment_id uuid not null
    references public.intelligence_document_segments(id) on delete cascade,
  content_hash text not null check (btrim(content_hash) <> ''),
  anchor_ordinal integer not null check (anchor_ordinal > 0),
  created_at timestamptz not null default now(),
  primary key (
    owner_id,
    maintenance_version,
    embedding_model,
    segment_id
  ),
  unique (
    owner_id,
    maintenance_version,
    embedding_model,
    anchor_ordinal
  ),
  foreign key (owner_id, maintenance_version, embedding_model)
    references public.intelligence_topic_knn_builds (
      owner_id,
      maintenance_version,
      embedding_model
    ) on delete cascade
);

create index if not exists intelligence_topic_knn_members_segment_idx
  on public.intelligence_topic_knn_members (segment_id);

alter table public.intelligence_topic_knn_members enable row level security;
revoke all on table public.intelligence_topic_knn_members
  from public, anon, authenticated;
grant all on table public.intelligence_topic_knn_members to service_role;

create table if not exists public.intelligence_topic_knn_edges (
  owner_id uuid not null,
  maintenance_version text not null check (btrim(maintenance_version) <> ''),
  embedding_model text not null check (btrim(embedding_model) <> ''),
  window_start date not null,
  left_segment_id uuid not null
    references public.intelligence_document_segments(id) on delete cascade,
  right_segment_id uuid not null
    references public.intelligence_document_segments(id) on delete cascade,
  similarity double precision not null check (similarity between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (
    owner_id,
    maintenance_version,
    embedding_model,
    window_start,
    left_segment_id,
    right_segment_id
  ),
  foreign key (owner_id, maintenance_version, embedding_model)
    references public.intelligence_topic_knn_builds (
      owner_id,
      maintenance_version,
      embedding_model
    ) on delete cascade,
  check (left_segment_id < right_segment_id)
);

create index if not exists intelligence_topic_knn_edges_right_segment_idx
  on public.intelligence_topic_knn_edges (right_segment_id);

create index if not exists intelligence_topic_knn_edges_left_segment_idx
  on public.intelligence_topic_knn_edges (left_segment_id);

alter table public.intelligence_topic_knn_edges enable row level security;
revoke all on table public.intelligence_topic_knn_edges
  from public, anon, authenticated;
grant all on table public.intelligence_topic_knn_edges to service_role;

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

  -- Filtered HNSW queries otherwise stop after the initial candidate list and
  -- can return too few in-cohort neighbours. pgvector 0.8+ supports bounded
  -- iterative scans; set them only when the installed extension supports them.
  select extension.extversion
  into vector_extension_version
  from pg_catalog.pg_extension extension
  where extension.extname = 'vector';
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
      where embedding.owner_id = query_owner
        and embedding.embedding_model = query_embedding_model
        and segment.segment_type in ('editorial', 'unknown')
        and segment.exclusion_reason is null
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

    -- Snapshot creation is a corpus-wide operation. Commit it independently
    -- before starting lateral ANN work so each serverless RPC stays bounded.
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
