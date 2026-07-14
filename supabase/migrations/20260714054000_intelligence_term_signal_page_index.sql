-- Candidate pages filter by the complete immutable snapshot contract before
-- advancing ordinal. Cover that exact lookup so large pruned support tables do
-- not force heap scans for every term page or exact remaining-count check.

create index if not exists intelligence_term_signal_refresh_page_idx
  on public.intelligence_term_signal_refresh_terms (
    owner_id,
    refresh_id,
    extraction_version,
    start_date,
    end_date,
    ordinal
  )
  include (observation_count)
  where ordinal is not null;
