# Phase 1D: OpenClaw → Crashboard ingestion (Baggo Topics)

OpenClaw watches the Baggo Topics Telegram group/topic and **calls Crashboard over HTTPS** when links are dropped. Crashboard remains the **ingestion owner**: it persists to Supabase using server secrets and reuses `runIngestion` (Phase 1B). This path **does not** register a second Telegram bot webhook on Crashboard.

## Endpoint

`POST /api/ingestion/openclaw`  
**Runtime:** Node.js

## Authentication

- Env: **`OPENCLAW_INGESTION_SECRET`** (required for the route to accept traffic).
- Header: **`Authorization: Bearer <OPENCLAW_INGESTION_SECRET>`**
- If the secret is **not set**, the route responds **503** with a clear message (endpoint disabled).
- Wrong or missing Bearer → **401**.

Also required: **`SUPABASE_SERVICE_ROLE_KEY`**, **`NEXT_PUBLIC_SUPABASE_URL`**.

## Request body (JSON)

Validated with **Zod** (`src/lib/openclaw/ingestion/schema.ts`).

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `kind` | `"url"` | yes | URL-only in Phase 1D |
| `url` | string | yes | Trimmed, max 8000 chars |
| `title` | string | no | Max 500 chars |
| `metadata` | object | no | Merged into `runIngestion` request metadata (affects `sources.metadata` merge order) |
| `openclaw` | object | no | Orchestrator context (all fields optional) |
| `telegram` | object | yes | Message identity + optional sender/text |

### `openclaw` (optional)

- `agent` — optional agent name (max 200)
- `orchestrator` — defaults to `"openclaw"` in stored metadata if omitted
- `channel` — defaults to `"telegram"` if omitted
- `session_id` — optional (max 256)
- `event_id` — optional (max 256)

### `telegram` (required)

- `chat_id` — number or integer string (large IDs supported as string for bigint)
- `message_id` — number or integer string
- `thread_id` — optional / nullable (forum topic)
- `sender_id` — optional / nullable
- `sender_label` — optional
- `raw_text` — optional excerpt of dropped text (max 20k)
- `topic_id` — optional string identifier
- `group_title` — optional

## Provenance model

| Layer | What we store |
| --- | --- |
| **`sources.origin`** | `"telegram"` (human/source context is Telegram) |
| **`sources.metadata`** | Compact: `ingested_via: "openclaw"`, `openclaw: { … }`, `telegram: { chat_id, message_id, thread_id }` |
| **`ingestion_jobs.trigger_type`** | `openclaw.telegram.url` |
| **`ingestion_jobs.trigger_reference`** | `openclaw:telegram:<chatId>:<thread\|0>:<messageId>` |
| **`ingestion_events`** | `provider = 'telegram'` (not “openclaw”). Row metadata includes `phase1d`, `pathway: "openclaw"`, compact `openclaw` + `telegram` objects. OpenClaw is the **caller**, Telegram is the **human context**. |

## Idempotency / dedupe

Uses the same partial unique index as Phase 1C:  
`(provider = 'telegram', chat_id, COALESCE(thread_id, 0), message_id)`.

- First request for a message: insert `ingestion_events`, run `runIngestion`, link job/source on the event.
- Retry with the same Telegram identity: **no second event**, **no second ingestion** — HTTP **200** with `deduped: true`, `eventId`, and `existingIngestionJobId` / `existingSourceId` when present.

If the native Telegram webhook (Phase 1C) already created the event for that message, OpenClaw dedupes against the same row.

## Example request

```http
POST /api/ingestion/openclaw HTTP/1.1
Host: crashboard.example.com
Authorization: Bearer <OPENCLAW_INGESTION_SECRET>
Content-Type: application/json

{
  "kind": "url",
  "url": "https://example.com/article",
  "title": "Optional title override",
  "metadata": { "baggo_topic": "links" },
  "openclaw": {
    "agent": "baggo-watcher",
    "orchestrator": "openclaw",
    "channel": "telegram",
    "session_id": "sess_abc",
    "event_id": "evt_123"
  },
  "telegram": {
    "chat_id": "-1001234567890",
    "message_id": 42,
    "thread_id": 7,
    "sender_id": 987654321,
    "sender_label": "@user",
    "raw_text": "https://example.com/article",
    "group_title": "Baggo Topics"
  }
}
```

## Example responses

**Success (first time):**

```json
{
  "ok": true,
  "deduped": false,
  "eventId": "uuid",
  "job": { "id": "uuid", "status": "completed", "errorMessage": null },
  "source": { "id": "uuid", "sourceType": "article", "canonicalUrl": "...", "contentHash": "...", "existed": false },
  "summary": "URL ingested; HTML text extracted."
}
```

**Deduped retry:**

```json
{
  "ok": true,
  "deduped": true,
  "eventId": "uuid",
  "existingIngestionJobId": "uuid",
  "existingSourceId": "uuid",
  "message": "This Telegram message was already recorded; ingestion was not re-run."
}
```

**Ingestion failure** (e.g. fetch error): same shape as Phase 1B (`ok: false`, `code`, `message`, `httpStatus`, optional `details`).

## Code map

| Piece | Path |
| --- | --- |
| Route | `src/app/api/ingestion/openclaw/route.ts` |
| Schema / parse | `src/lib/openclaw/ingestion/schema.ts` |
| Orchestration | `src/lib/openclaw/ingestion/orchestrate.ts` |
| Bearer helpers | `src/lib/http/verify-bearer-secret.ts` |
| Trigger constant | `TRIGGER_OPENCLAW_TELEGRAM_URL` in `src/lib/ingestion/constants.ts` |

## Manual verification

1. Set `OPENCLAW_INGESTION_SECRET` and Supabase env vars locally or on Vercel.
2. Apply migrations (including Telegram message dedupe index from Phase 1C).
3. `curl` the example body to `/api/ingestion/openclaw` with the Bearer header.
4. Repeat the same `telegram.chat_id` / `thread_id` / `message_id`: expect `deduped: true`.

## Phase 1E (structured / Leroy)

Agent-extracted payloads (no server fetch) use **`POST /api/ingestion/openclaw/structured`** with the same Bearer secret. See [phase1e-structured-ingestion.md](./phase1e-structured-ingestion.md).

## Deferred

Queues, outbound Telegram replies, non-URL kinds, and OpenClaw-specific DB enums — not in this phase.
