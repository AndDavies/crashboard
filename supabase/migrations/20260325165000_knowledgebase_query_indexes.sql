-- Knowledgebase query/index optimization
-- Supports repository list/search/filter/sort workloads.

create index if not exists documents_search_document_gin_idx
  on public.documents
  using gin (search_document);

create index if not exists documents_captured_at_desc_idx
  on public.documents (captured_at desc);

create index if not exists documents_published_at_desc_idx
  on public.documents (published_at desc);

create index if not exists documents_title_idx
  on public.documents (title);

create index if not exists documents_review_status_idx
  on public.documents (review_status);

create index if not exists documents_ingestion_status_idx
  on public.documents (ingestion_status);

create index if not exists documents_source_type_idx
  on public.documents (source_type);

create index if not exists documents_canonical_key_idx
  on public.documents (canonical_key)
  where canonical_key is not null;

create index if not exists documents_external_source_idx
  on public.documents (source_type, external_id)
  where external_id is not null;

create index if not exists documents_canonical_url_idx
  on public.documents (canonical_url)
  where canonical_url is not null;

create index if not exists documents_original_url_idx
  on public.documents (original_url);

create index if not exists tags_tag_normalized_idx
  on public.tags (tag_normalized);

create index if not exists tags_tag_normalized_type_idx
  on public.tags (tag_normalized, tag_type);

create index if not exists document_tags_tag_id_document_id_idx
  on public.document_tags (tag_id, document_id);

create index if not exists document_tags_document_id_idx
  on public.document_tags (document_id);

create index if not exists document_captures_document_id_captured_at_idx
  on public.document_captures (document_id, captured_at desc);

create index if not exists document_links_from_document_id_idx
  on public.document_links (from_document_id);

create index if not exists document_links_to_document_id_idx
  on public.document_links (to_document_id)
  where to_document_id is not null;

create index if not exists document_links_relation_url_idx
  on public.document_links (from_document_id, relation, url)
  where url is not null;
