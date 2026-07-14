-- Pair the signal segment index with a stable owner-scoped document lookup.
-- Existing document indexes order by publication date or source identity and
-- cannot satisfy the refresh's deterministic ID pagination.

create index if not exists documents_owner_id_signal_refresh_idx
  on public.documents (owner_id, id)
  where owner_id is not null;
