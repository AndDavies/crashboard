create index if not exists intelligence_runs_source_idx
  on public.intelligence_runs (source_id);
create index if not exists intelligence_clusters_canonical_document_idx
  on public.intelligence_clusters (canonical_document_id);
create index if not exists intelligence_cluster_documents_owner_idx
  on public.intelligence_cluster_documents (owner_id);
create index if not exists intelligence_cluster_documents_document_idx
  on public.intelligence_cluster_documents (document_id);
create index if not exists intelligence_entity_aliases_entity_idx
  on public.intelligence_entity_aliases (entity_id);
create index if not exists intelligence_document_entities_owner_idx
  on public.intelligence_document_entities (owner_id);
create index if not exists intelligence_document_entities_entity_idx
  on public.intelligence_document_entities (entity_id);
create index if not exists intelligence_events_cluster_idx
  on public.intelligence_events (cluster_id);
create index if not exists intelligence_event_evidence_owner_idx
  on public.intelligence_event_evidence (owner_id);
create index if not exists intelligence_event_evidence_document_idx
  on public.intelligence_event_evidence (document_id);
create index if not exists intelligence_event_entities_owner_idx
  on public.intelligence_event_entities (owner_id);
create index if not exists intelligence_event_entities_entity_idx
  on public.intelligence_event_entities (entity_id);
create index if not exists intelligence_watchlists_owner_idx
  on public.intelligence_watchlists (owner_id);
create index if not exists intelligence_alerts_watchlist_idx
  on public.intelligence_alerts (watchlist_id);
create index if not exists intelligence_alerts_event_idx
  on public.intelligence_alerts (event_id);
create index if not exists intelligence_alerts_trend_snapshot_idx
  on public.intelligence_alerts (trend_snapshot_id);
