-- Signal refresh reads eligible segments in stable ID order. The prior index
-- ordered by document_id, forcing PostgREST to sort wide content rows before
-- returning each page and exceeding the production statement timeout.

create index if not exists intelligence_segments_signal_refresh_idx
  on public.intelligence_document_segments (owner_id, id)
  where exclusion_reason is null
    and segment_type in ('editorial', 'unknown');
