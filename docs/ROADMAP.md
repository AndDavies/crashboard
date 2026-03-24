# ROADMAP.md — Personal Knowledgebase

## Phase 1 — Reset and re-specify
Goal: replace the over-engineered backend direction with a clean, simpler model.

- [x] Confirm that the current schema should be discarded rather than preserved
- [x] Re-state product intent around repository first, knowledgebase second
- [x] Define the new schema direction in `SCHEMA.md`
- [ ] Update Crashboard backend plan to target the new schema only
- [ ] Update Leroy payload expectations to include summaries and tags
- [ ] Update implementation prompts/runbooks to match the new model

## Phase 2 — Repository backend
Goal: make saved content durable, searchable, and easy to browse.

- [ ] Create new tables:
  - `documents`
  - `document_captures`
  - `tags`
  - `document_tags`
  - `document_links`
- [ ] Define canonical dedupe rules
- [ ] Parse Telegram hashtags into user tags
- [ ] Add Leroy-generated summary/keyword enrichment to the payload
- [ ] Upsert canonical document rows from structured payloads
- [ ] Store provenance as capture rows
- [ ] Store fanout/related-link relationships
- [ ] Add Postgres full-text search over title/content/transcript/summary/tags
- [ ] Validate with article, PDF, YouTube, X post, and linked-article fanout examples

## Phase 3 — Repository UI
Goal: make the corpus useful before semantic retrieval exists.

- [ ] Add inbox/library page in Crashboard
- [ ] Add filters for source type, tags, review status, publisher, and date
- [ ] Add source detail page with extracted text/transcript and summary
- [ ] Show metadata, provenance, and related items
- [ ] Make original URL easy to open
- [ ] Support basic review workflow such as inbox → reviewed

## Phase 4 — Knowledgebase foundation
Goal: make the repository queryable via embeddings.

- [ ] Create `document_chunks`
- [ ] Create `document_embeddings`
- [ ] Add chunking pipeline for normalized source text
- [ ] Add embeddings generation/storage
- [ ] Add retrieval endpoint / function
- [ ] Add recency-aware and source-aware reranking only if needed after testing
- [ ] Add a minimal ask/query interface with citations back to repository items

## Phase 5 — Refinement
Goal: improve retrieval and organization without overcomplication.

- [ ] Evaluate whether manual tagging/curation is needed beyond Telegram hashtags
- [ ] Tune Leroy keyword quality
- [ ] Add lightweight entity hints only if they materially improve retrieval
- [ ] Review export/portability path for the corpus
- [ ] Tune retrieval quality after real usage

## Documentation and agent-awareness work
Goal: make any future agent effective quickly.

- [ ] Keep `PROJECT.md`, `DECISIONS.md`, `ROADMAP.md`, `STATUS.md`, and `MEMORY.md` aligned
- [ ] Update `LEROY.md`, `PAYLOAD-CONTRACT.md`, and `HANDOFF.md` to reflect the v2 schema and enrichment behavior
- [ ] Add SQL schema file and migration notes once implementation begins
- [ ] Update `TOOLS.md` if helper scripts or endpoints change
- [ ] Update any implementation prompts so Ada or Cursor can build from the new source of truth
- [ ] If a dedicated Leroy runtime is created later, document the `agentId` and operating workflow in `AGENTS.md`

## Recommended execution order
1. Finalize the v2 schema and payload contract
2. Rebuild backend tables and ingestion endpoint
3. Validate end-to-end ingestion on supported source types
4. Build repository/library UI
5. Add chunking + embeddings
6. Build ask/query interface
7. Tune enrichment and retrieval after real usage

## Current strategic note
The fastest path is not to preserve old schema work.
The fastest path is to rebuild around a simple repository model that supports:
- extracted content
- provenance
- tags
- summaries
- browse/search now
- embeddings later
