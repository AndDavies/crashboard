# Phase 1: Ingestion schema (Supabase/Postgres)

SQL migration: `supabase/migrations/20250321170000_phase1_ingestion_schema.sql`

Apply with the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase db push` / linked project) or paste into the SQL editor for a one-off apply.

## Table purposes

| Table | Purpose |
| --- | --- |
| **sources** | One canonical row per logical item (article, video, thread, PDF, etc.). Holds identity, URLs, title, author/publisher, lifecycle **status**, **content_hash** / **canonical_url** for dedup, and flexible **metadata**. |
| **source_contents** | Extracted and normalized text/HTML/markdown separated from catalog fields. Supports **transcript_text**, **extraction_method** / **extraction_version**, quality **quality_flags**, counts, and **superseded_at** so reprocessing keeps history while enforcing one “current” row per **content_kind**. |
| **ingestion_jobs** | Pipeline queue: **trigger_type** / **trigger_reference**, **status**, errors, **attempt_count**, timing. **source_id** nullable until the **sources** row exists. |
| **ingestion_events** | Provenance: **provider** (e.g. `telegram`) plus optional **chat_id**, **thread_id**, **message_id**, **sender_***, **raw_text**, **attachments** (JSON array), **metadata**. Links optionally to **sources** and **ingestion_jobs**. |
| **source_artifacts** | Pointers to blobs (PDFs, HTML snapshots, thumbnails, etc.): **storage_path**, **mime_type**, **byte_size**, **checksum**, **artifact_type**. |
| **entities** | Minimal stub for later NER/graph (**label**, **entity_type**, **metadata**). |
| **source_entities** | Many-to-many **source** ↔ **entity** with optional **role**, **confidence**, text **span_**\* for future grounding. |

## Intentionally deferred (Phase 2+)

- Chunk tables (fixed/windowed segments, parent FK to **source_contents** or **sources**).
- Vector / embedding columns or tables (pgvector), hybrid search indexes, re-ranking features.
- Full **entity** resolution (canonical IDs, merging, external KB links).
- **User** / tenancy columns and client **RLS** policies (see below).
- Time-aware and source-weighted ranking (materialized views or scoring tables).
- Webhook/event outbox, dead-letter queues, or workflow engines (only **ingestion_jobs** in Phase 1).

## Constraints and indexes (summary)

- **Enums** for **source_type**, **source_status**, **content_kind**, **ingestion_job_status**, **ingestion_provider**, **artifact_type** — validated at the DB, stable for app code.
- **sources**: partial **UNIQUE** on **canonical_url** and **content_hash** (when not null) for dedup; indexes on **status + ingested_at**, **source_type**, **published_at**; index on **original_url** (non-unique; query + debugging).
- **source_contents**: partial **UNIQUE (source_id, content_kind) WHERE superseded_at IS NULL** — one current revision per kind; index on **(source_id, created_at DESC)** for history.
- **ingestion_jobs**: **(status, created_at DESC)** for queue dashboards; **source_id** partial index.
- **ingestion_events**: composite index for Telegram-style lookups **(provider, chat_id, thread_id, message_id)**; **received_at** for recent activity.
- **source_artifacts**: **UNIQUE(storage_path)** — use paths that encode uniqueness (e.g. bucket key with **source_id** / UUID); indexes on **source_id** and **(source_id, artifact_type)**.
- **jsonb** columns constrained with **CHECK** to `object` or `array` where applicable.

## RLS

All listed tables have **RLS enabled** with **no** policies yet — only the **service role** (and postgres) can read/write until you add policies (e.g. after introducing `owner_id` or a profile join).

## How Phase 2 chunking / vectors can attach without redesign

- Chunks should **reference** `sources.id` and preferably `source_contents.id` (the **current** row for `content_kind = 'primary'` or `transcript`) so embeddings stay tied to the normalized text that was actually chunked.
- **ingestion_jobs** can gain new **trigger_type** values or separate job kinds for “chunk” / “embed”; no need to overload **source_contents**.
- **source_artifacts** can store sidecars (e.g. cached transcript files) while **source_contents** holds the normalized text used for chunking.
- **content_hash** on **sources** remains useful to skip re-embedding when normalized content is unchanged.

## Telegram types

Use **bigint** for Telegram IDs. Put structured attachment summaries in **ingestion_events.attachments** (JSON array); optional extra fields in **metadata**.

**Phase 1C deduplication:** partial unique index `ingestion_events_telegram_message_uidx` on `(chat_id, COALESCE(thread_id, 0), message_id)` where `provider = 'telegram'` (see migration `20250322120000_ingestion_events_telegram_dedup.sql`). The same key is used for **Phase 1D OpenClaw** calls (`POST /api/ingestion/openclaw`) so one Telegram message maps to one `ingestion_events` row regardless of whether the native webhook or OpenClaw arrived first.
