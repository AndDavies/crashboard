/** Pipeline / extraction version stored on source_contents.extraction_version */
export const INGESTION_EXTRACTION_VERSION = "phase1b";

/** ingestion_jobs.attempt_count bumps on each processing attempt */
export const INGESTION_ORIGIN_API = "api";

/** sources.origin when ingested from Telegram webhook */
export const INGESTION_ORIGIN_TELEGRAM = "telegram";

/** ingestion_jobs.trigger_type for OpenClaw → Baggo Topics URL drops */
export const TRIGGER_OPENCLAW_TELEGRAM_URL = "openclaw.telegram.url";

/** Agent-side structured payload (Leroy / OpenClaw) — no server fetch */
export const TRIGGER_OPENCLAW_STRUCTURED = "openclaw.structured";

/** sources.origin when no Telegram identity in payload (orchestrator-only) */
export const INGESTION_ORIGIN_OPENCLAW = "openclaw";

export const FETCH_TIMEOUT_MS = 45_000;

/** Hard cap to limit accidental huge downloads (PDF/HTML). */
export const MAX_FETCH_BYTES = 40 * 1024 * 1024;

export const INGESTION_USER_AGENT =
  "CrashboardIngestion/1.0 (+https://github.com/AndDavies/crashboard; phase1b)";
