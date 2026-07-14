-- Keep generation-pinned story/event context scans below the production
-- PostgREST statement timeout as the retained cluster history grows.
create index if not exists intelligence_clusters_owner_type_id_idx
  on public.intelligence_clusters (owner_id, cluster_type, id);
