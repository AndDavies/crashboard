# DECISIONS.md — Personal Knowledgebase

## Accepted decisions

### 2026-03-22 — Personal Knowledgebase project context created
A dedicated durable project folder was created under `projects/personal-knowledgebase/` so future work is not trapped in chat history.

### 2026-03-22 — Supabase is the database of record
Earlier mention of SQLite is no longer in scope for this implementation.
The project will use Supabase / Postgres as the storage layer.

### 2026-03-22 — Crashboard is the implementation home
This project is conceptually separate, but the active implementation currently lives inside the Crashboard codebase and dashboard.

### 2026-03-22 — Product goal is personal capture + personal RAG
The system should do two jobs:
- act as a low-friction personal repository for content discovered throughout the day
- act as a personal knowledge base with semantic retrieval later

### 2026-03-22 — Telegram is the primary capture interface
The default ingestion UX is dropping URLs into a Telegram topic.
The system should preserve enough provenance to know what came from where.

### 2026-03-22 — Prioritize useful source coverage over broader infrastructure
The immediate priority is reliable ingestion for:
- articles
- PDFs
- YouTube videos
- X/Twitter posts and threads

This matters more than adding additional generalized ingestion abstractions.

### 2026-03-22 — Avoid overengineering
The current implementation direction should be simplified around user value:
- capture reliability
- readable stored content
- retrieval usefulness

Not around speculative infrastructure.

### 2026-03-22 — Dashboard implementation can be prompt-driven
Dashboard coding can be generated as prompts for Cursor and then implemented/deployed from there.

### 2026-03-22 — Leroy created as the dedicated ingestion specialist
Leroy is the dedicated specialist for Personal Knowledgebase ingestion.
He is responsible for source detection, fetching, extraction, normalization, fanout, and lightweight enrichment.
Baggo should act as the front door and orchestrator; Leroy should handle the ingestion-specific content work.

### 2026-03-22 — Agent-side extraction is the preferred ingestion model
The preferred implementation model is now agent-side extraction first.
That means the agent should pull and normalize the actual content locally, then send structured payloads to Crashboard for storage.
This is preferred over relying entirely on server-side scraping inside Crashboard.

### 2026-03-22 — X scope narrowed to single-post extraction plus linked-article fanout
The project no longer requires full X/Twitter thread expansion for the core capture workflow.
For now, useful X support means:
- extract the visible text of a single X post
- detect outbound article/PDF URLs in that post
- fan out ingestion for linked articles

This avoids making paid X API access a dependency for the main personal capture workflow.

### 2026-03-24 — Discard the current backend schema and restart cleanly
The existing backend schema should not be preserved or integrated.
The project is early enough to restart from scratch with a simpler model.

### 2026-03-24 — The repository is the primary system; the knowledgebase is phase 2
The backend should first support a useful repository/library workflow:
- save
- extract
- review
- tag
- filter
- search
- browse

Chunking, embeddings, and semantic retrieval should be built on top of that repository later.

### 2026-03-24 — Use a document-first schema
The new schema should center on a primary `documents` table, plus small supporting tables for:
- capture provenance
- tags
- relationships/fanout
- later chunks and embeddings

Avoid a fragmented ingestion-heavy schema.

### 2026-03-24 — Telegram hashtags become first-class user tags
Andrew can use hashtags in Telegram Topics messages to label saved content.
Those hashtags should be parsed and stored as searchable tags connected to the saved document.

### 2026-03-24 — Leroy should add summary and keyword enrichment
In addition to extraction and normalization, Leroy should generate:
- a short summary/snapshot
- lightweight keywords/tags
- pragmatic topic/entity hints that help search and filtering

This enrichment should remain lightweight and useful rather than becoming ontology work.

### 2026-03-24 — Portability is a design requirement
The schema should remain easy to export and move.
Store canonical text and metadata plainly, and keep embeddings separate so they can be regenerated.

## Working implementation principles

- Keep the schema and system pragmatic
- Add only the next tables and flows needed for usefulness
- Prefer a clean restart over incremental compatibility with a flawed model
- Defer heavy entity/graph sophistication
- Prefer vertical slices that increase end-user value quickly
- Treat the repository and knowledgebase as two interfaces over one corpus
