-- Term scoring is driven by normalized-term ranges and then returns a compact
-- set of observation fields. Cover those fields so the bounded RPC avoids a
-- heap lookup for every one of the archive's 500k term observations.

create index if not exists intelligence_terms_signal_cover_idx
  on public.intelligence_term_observations (
    owner_id,
    extraction_version,
    normalized_term,
    observed_on,
    segment_id
  )
  include (
    document_id,
    display_term,
    occurrence_count,
    salience
  );
