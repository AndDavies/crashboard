-- Keep resumable support finalization index-driven after large prune batches
-- create substantial dead-row ranges in the general refresh indexes.

create index if not exists intelligence_term_signal_refresh_low_support_idx
  on public.intelligence_term_signal_refresh_terms (
    owner_id,
    refresh_id,
    normalized_term
  )
  where observation_count < 3;

create index if not exists intelligence_term_signal_refresh_unordinalized_idx
  on public.intelligence_term_signal_refresh_terms (
    owner_id,
    refresh_id,
    normalized_term
  )
  where ordinal is null and observation_count >= 3;
