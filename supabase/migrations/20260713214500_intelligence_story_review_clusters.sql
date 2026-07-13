-- Keep borderline story matches for human review without merging them into
-- the measurement story count.
alter table public.intelligence_clusters
  drop constraint if exists intelligence_clusters_cluster_type_check,
  add constraint intelligence_clusters_cluster_type_check check (cluster_type in (
    'exact_duplicate', 'syndicated', 'event', 'story', 'story_review', 'topic'
  ));
