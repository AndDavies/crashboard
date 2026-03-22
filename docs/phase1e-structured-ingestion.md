# Phase 1E: Structured (agent-extracted) ingestion

**Leroy** (or another extraction agent) runs **outside** Crashboard: fetch, extract, normalize, and fan out. Crashboard **does not re-fetch** URLs for this path; it only validates JSON and writes to Supabase.

Flow: Andrew drops a link in Baggo Topics → OpenClaw/Baggo → **Leroy** produces a structured payload → **Crashboard** stores `sources`, `source_contents`, `ingestion_jobs`, optional `ingestion_events`, `source_artifacts`, and `entities` / `source_entities`.

## Endpoint

`POST /api/ingestion/openclaw/structured`  
**Runtime:** Node.js

## Authentication

Same as [Phase 1D OpenClaw URL ingestion](./phase1d-openclaw-ingestion.md):

- **`OPENCLAW_INGESTION_SECRET`** (required; **503** if missing)
- **`Authorization: Bearer <secret>`**
- Plus **`SUPABASE_SERVICE_ROLE_KEY`** and **`NEXT_PUBLIC_SUPABASE_URL`**

## Request body

Top-level:

- **`kind`**: must be `"structured"`.
- **`source`**: catalog fields (type, URLs, title, author, hash, etc.).
- **`content`**: extracted text bodies + `extraction_method` (required). At least one of `normalized_text`, `raw_text`, `html`, `markdown`, or `transcript_text` must be non-empty.
- **`artifacts`**: optional list (storage pointers only; no upload in this phase).
- **`entities`**: optional list → `entities` + `source_entities` (simple **label + entity_type** lookup; default type `unknown`).
- **`provenance`**: optional `origin`, `telegram`, `openclaw`, `metadata`.
- **`related_urls`**, **`fanout`**: optional hints stored on **`sources.metadata`** for later graph work.

Full Zod schema: `src/lib/ingestion/structured-schema.ts`.

### `sources.origin`

- If `provenance.origin` is set → use it.
- Else if `provenance.telegram` is present → **`telegram`**.
- Else → **`openclaw`**.

### Jobs

- **`ingestion_jobs.trigger_type`**: `openclaw.structured`
- **`ingestion_jobs.trigger_reference`**: `openclaw:structured:telegram:<chat>:<thread|0>:<message>` when Telegram ids exist; otherwise a string derived from hash / canonical / original URL.

### Telegram provenance

When `provenance.telegram` is present:

- Reuses the same **`ingestion_events`** dedupe key as Phase 1C/1D (`provider = telegram`, `chat_id`, `COALESCE(thread_id,0)`, `message_id`).
- **`ingestion_events.metadata`** includes `pathway: "openclaw-structured"`, `extracted_by` (from `openclaw.extracted_by` or `openclaw.agent` or default **`leroy`**), compact `openclaw` / `telegram` objects.
- If the event row **already exists**, metadata is **merged** and `raw_text` may be refreshed; ingestion **still runs** (new job, updated source/content) — only the **event row** is not duplicated.

## Dedupe (sources)

Match order:

1. `source.canonical_url` (if set)
2. Else `content_hash` from payload, or **SHA-256 of normalized primary text** if hash omitted
3. Else `source.original_url` (first existing row wins)

On match: metadata merged, catalog fields updated where provided, **`source_contents`**: current row for the request’s `content_kind` is **superseded**, then a new current row is inserted.

## Response (success)

```json
{
  "ok": true,
  "deduped": false,
  "eventId": "uuid",
  "eventDeduped": true,
  "job": { "id": "uuid", "status": "completed" },
  "source": {
    "id": "uuid",
    "sourceType": "article",
    "canonicalUrl": "https://…",
    "contentHash": "…",
    "existed": false
  },
  "content": {
    "contentKind": "primary",
    "characterCount": 1234,
    "tokenEstimate": 309
  },
  "artifacts": [{ "id": "uuid", "storagePath": "…" }],
  "entityCount": 2,
  "summary": "Structured payload stored; new source and content created."
}
```

- **`deduped`**: existing **`sources`** row was matched.
- **`eventDeduped`**: optional; true when the Telegram **event** row already existed (dedupe on message identity).

Errors use the same style as other ingestion routes (`ok: false`, `code`, `message`, `httpStatus`).

## Example payload (minimal article + Telegram)

```json
{
  "kind": "structured",
  "source": {
    "source_type": "article",
    "original_url": "https://example.com/post",
    "canonical_url": "https://example.com/post",
    "title": "Example post",
    "author_name": "A. Author",
    "publisher_name": "Example News",
    "language": "en",
    "published_at": "2025-03-22T12:00:00Z",
    "content_hash": null,
    "metadata": { "leroy_version": "0.2" }
  },
  "content": {
    "content_kind": "primary",
    "normalized_text": "Full plain text of the article…",
    "raw_text": null,
    "extraction_method": "leroy.readability",
    "extraction_version": "leroy-0.2",
    "quality_flags": { "paywall_skipped": false }
  },
  "provenance": {
    "telegram": {
      "chat_id": "-1001234567890",
      "message_id": 99,
      "thread_id": 3,
      "sender_label": "@andrew",
      "raw_text": "https://example.com/post"
    },
    "openclaw": {
      "agent": "leroy",
      "extracted_by": "leroy",
      "session_id": "sess_1",
      "event_id": "evt_1"
    }
  },
  "related_urls": ["https://example.com/related"],
  "fanout": {
    "parent_url": null,
    "relation": "same_series",
    "discovered_from": "https://example.com/index"
  }
}
```

## Code map

| Piece | Path |
| --- | --- |
| Route | `src/app/api/ingestion/openclaw/structured/route.ts` |
| Zod schema | `src/lib/ingestion/structured-schema.ts` |
| Orchestrator | `src/lib/ingestion/structured-service.ts` |
| Repository extensions | `src/lib/ingestion/repository.ts` |

## Non-goals (this phase)

Chunking, embeddings, search, dashboard UI, queues, server-side scraping for this endpoint, and rich entity canonicalization.
