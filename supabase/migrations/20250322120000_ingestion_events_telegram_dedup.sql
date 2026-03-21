-- One provenance row per Telegram message (provider + chat + thread + message_id).
-- Enables idempotent webhook handling without duplicate ingestion_events.

CREATE UNIQUE INDEX ingestion_events_telegram_message_uidx
  ON public.ingestion_events (
    chat_id,
    (COALESCE(thread_id, (0)::bigint)),
    message_id
  )
  WHERE provider = 'telegram';

COMMENT ON INDEX public.ingestion_events_telegram_message_uidx IS
  'Dedupe Telegram webhook deliveries: same chat/thread/message maps to one ingestion_events row.';
