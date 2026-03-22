# Phase 1C: Telegram URL webhook

Minimal integration: Telegram sends updates to this app; messages that contain **http(s) URLs** trigger the same `runIngestion` pipeline as `POST /api/ingestion` (no internal HTTP hop).

## Route

`POST /api/telegram/webhook` — **Node.js** runtime.

## Auth

Configure [setWebhook](https://core.telegram.org/bots/api#setwebhook) with `secret_token` set to the same value as env **`TELEGRAM_WEBHOOK_SECRET`**. Telegram sends it on each request as header **`X-Telegram-Bot-Api-Secret-Token`**.

- If the secret env is **missing**, the route responds **503** (webhook not operational).
- If the header **does not match**, responds **401**.

Also required (same as ingestion): **`SUPABASE_SERVICE_ROLE_KEY`** and **`NEXT_PUBLIC_SUPABASE_URL`**.

## Behavior

- Handles `message`, `edited_message`, `channel_post`, `edited_channel_post`.
- Collects URLs from `text` and `caption` (order preserved, duplicates removed).
- Non-URL messages and unsupported updates: **200** with `{ ok: true, telegram: { handled: false, ignoredReason: "…" } }` (no DB writes).
- **Idempotency:** migration `20250322120000_ingestion_events_telegram_dedup.sql` adds a **partial unique index** on `(chat_id, COALESCE(thread_id,0), message_id)` for `provider = telegram`. A duplicate webhook for the same message returns **200** with `deduped: true` and **does not** run ingestion again.
- Multiple URLs: **sequential** `runIngestion({ kind: "url", … })` per URL; per-URL failures do not stop the rest.
- **`ingestion_events`:** one row per Telegram message (first delivery), with `attachments` summarizing photos/documents/etc., `metadata.phase1c`, `update_id`, `url_results` after processing.
- **`ingestion_jobs`:** one job per URL (`trigger_type`: `telegram.url`, `trigger_reference`: `telegram:{chatId}:msg:{messageId}:url:{index}`).
- **`sources`:** `origin` = `telegram`; compact `metadata` (`ingested_via`, `telegram` ids). Full payload context stays on the event row.

## Database

Apply the new migration so deduplication works:

```bash
supabase db push
# or run SQL from supabase/migrations/20250322120000_ingestion_events_telegram_dedup.sql
```

## Manual verification

1. Set `TELEGRAM_WEBHOOK_SECRET` and service-role env vars locally or on the host.
2. Expose HTTPS (e.g. ngrok) and call `setWebhook` with your public URL `https://…/api/telegram/webhook` and the same `secret_token`.
3. Send a message with `https://example.com` in a test chat.
4. Confirm rows in `ingestion_events`, `ingestion_jobs`, and `sources` (and `source_contents` when extraction succeeds).
5. Resend or let Telegram retry: second delivery should return `deduped: true` without duplicate `ingestion_events` rows.

## Deferred

- Outbound replies, queues, YouTube/X-specific typing, multipart file ingestion, large chat ID BigInt precision (see follow-ups in the PR/summary).

## Code map

| Area | Path |
| --- | --- |
| Webhook | `src/app/api/telegram/webhook/route.ts` |
| Orchestration | `src/lib/telegram/orchestrate.ts` |
| URL extraction | `src/lib/telegram/urls.ts` |
| Update parsing | `src/lib/telegram/parse-update.ts` |
| Ingestion options | `IngestionRunOptions` in `src/lib/ingestion/types.ts` |
| Event repository | `src/lib/ingestion/repository.ts` |

## OpenClaw (Phase 1D)

If a separate orchestrator (e.g. OpenClaw watching Baggo Topics) posts links to Crashboard, use **`POST /api/ingestion/openclaw`** instead of this webhook. The same `ingestion_events` dedupe key applies. See [phase1d-openclaw-ingestion.md](./phase1d-openclaw-ingestion.md).
