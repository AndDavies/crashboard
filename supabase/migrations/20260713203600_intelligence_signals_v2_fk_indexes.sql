-- Cover v2 foreign keys used by cleanup, backfill, and evidence lookups.

create index if not exists intelligence_terms_document_idx
  on public.intelligence_term_observations (document_id);
create index if not exists intelligence_terms_source_identity_idx
  on public.intelligence_term_observations (source_identity_id)
  where source_identity_id is not null;
create index if not exists intelligence_segment_embeddings_document_idx
  on public.intelligence_segment_embeddings (document_id);
create index if not exists intelligence_concept_embeddings_owner_idx
  on public.intelligence_concept_embeddings (owner_id);
create index if not exists intelligence_cluster_segments_owner_idx
  on public.intelligence_cluster_segments (owner_id);
create index if not exists intelligence_research_results_lead_idx
  on public.intelligence_research_results (lead_id);
