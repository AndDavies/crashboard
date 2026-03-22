# Phase 1B: URL / PDF ingestion API

Server-only ingestion for the Phase 1 schema (`sources`, `source_contents`, `ingestion_jobs`, `source_artifacts`). No chunking, embeddings, or UI.

## Endpoint

`POST /api/ingestion`

- **Runtime:** Node.js (`export const runtime = "nodejs"`) for PDF parsing.
- **Body (JSON):**

| Field | Required | Description |
| --- | --- | --- |
| `kind` | yes | `"url"` or `"pdf"` |
| `url` | yes | `http`/`https` URL to fetch |
| `title` | no | Override detected title |
| `metadata` | no | Merged into `sources.metadata` (object) |
| `triggerType` | no | Stored on `ingestion_jobs.trigger_type` (default `ingestion.{kind}`) |
| `triggerReference` | no | Stored on `ingestion_jobs.trigger_reference` (default: raw URL) |

## Auth

- If **`INGESTION_API_SECRET`** is set in the environment, send  
  `Authorization: Bearer <INGESTION_API_SECRET>`.
- If unset (typical local dev), the route accepts unauthenticated POSTs — **do not deploy production without a secret** unless you add another gate (e.g. Vercel protection, IP allowlist).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** for ingestion writes (RLS has no policies) |
| `INGESTION_API_SECRET` | Optional bearer gate for `POST /api/ingestion` |

## Behavior

1. Creates an `ingestion_jobs` row (`queued` → `processing` → terminal state).
2. Normalizes and fetches the URL (size limit, timeout, `User-Agent` set).
3. **PDF** (`kind === "pdf"`, `Content-Type: application/pdf`, or `.pdf` URL path): writes `source_artifacts` (`downloaded_pdf`, logical `storage_path` `ingestion/jobs/{jobId}/document.pdf`), sets `sources.source_type = pdf`, runs **pdf-parse** for text when possible; if text is empty or parsing fails, records deferral in `sources.metadata.phase1bPdf`.
4. **HTML / XHTML:** uses **cheerio** for primary text + light metadata (canonical link / `og:url`, title, `og:site_name`, `lang`). `sources.source_type` is `article`. `content_hash` is SHA-256 of normalized text when non-empty.
5. **Plain text:** `sources.source_type` is `document`.
6. Unsupported MIME types: job status **`skipped`**, HTTP **415**, `details.jobId` included.

Deduplication: reconcile by `canonical_url` first, then `content_hash` (when set), matching DB partial unique indexes. Current `source_contents` rows for `primary` are superseded before inserting a new current row.

## Intentionally deferred

- Multipart uploads, Telegram/X/YouTube, browser automation, queues/cron, embeddings/chunks/RAG, dashboard.

## Related code

- `src/lib/ingestion/*` — service, repository, fetch/extract helpers
- `src/lib/supabase/admin.ts` — service-role client

## Phase 1C (Telegram)

Telegram URL drops use the same `runIngestion` implementation with optional `IngestionRunOptions` (shared Supabase client, `sources.origin`, compact `sourceMetadata`). See [phase1c-telegram-webhook.md](./phase1c-telegram-webhook.md).

## Phase 1D (OpenClaw)

HTTPS calls from OpenClaw (Telegram orchestrator) use **`POST /api/ingestion/openclaw`** with **`OPENCLAW_INGESTION_SECRET`**. See [phase1d-openclaw-ingestion.md](./phase1d-openclaw-ingestion.md).
