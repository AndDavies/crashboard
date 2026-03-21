import type { SupabaseClient } from "@supabase/supabase-js";

/** Matches DB enum public.source_type */
export type SourceType =
  | "article"
  | "youtube_video"
  | "x_post"
  | "x_thread"
  | "pdf"
  | "note"
  | "document"
  | "unknown";

/** Matches DB enum public.source_status */
export type SourceStatus =
  | "draft"
  | "pending"
  | "ready"
  | "failed"
  | "archived";

/** Matches DB enum public.content_kind */
export type ContentKind =
  | "primary"
  | "transcript"
  | "description"
  | "ocr"
  | "structured"
  | "auxiliary";

/** Matches DB enum public.ingestion_job_status */
export type IngestionJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "retryable"
  | "skipped";

/** Matches DB enum public.artifact_type */
export type ArtifactType =
  | "uploaded_pdf"
  | "downloaded_pdf"
  | "thumbnail"
  | "transcript_file"
  | "html_snapshot"
  | "raw_html"
  | "screenshot"
  | "attachment"
  | "other";

export type IngestionKind = "url" | "pdf";

/** POST /api/ingestion JSON body */
export interface IngestionApiRequest {
  kind: IngestionKind;
  url?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  triggerType?: string;
  triggerReference?: string;
}

/**
 * Optional server-side context for `runIngestion` (direct API ignores this;
 * Telegram and other internal callers pass compact source metadata + shared client).
 */
export interface IngestionRunOptions {
  /** Reuse an existing service-role client (e.g. webhook + events in one request). */
  admin?: SupabaseClient;
  /** Overrides `sources.origin` (default `api`). */
  origin?: string;
  /**
   * Merged into `sources.metadata` after `{ phase1b: true }`, before request `metadata`.
   * Keep small; full Telegram payloads belong on `ingestion_events`.
   */
  sourceMetadata?: Record<string, unknown>;
}

export interface FetchedResource {
  finalUrl: string;
  originalUrl: string;
  contentType: string;
  byteLength: number;
  /** Raw bytes (PDF) */
  buffer?: ArrayBuffer;
  /** Decoded text for HTML-like types */
  textBody?: string;
}

export interface HtmlExtractionResult {
  canonicalUrl: string | null;
  title: string | null;
  publisherName: string | null;
  language: string | null;
  rawText: string;
  normalizedText: string;
  /** Optional stripped HTML snapshot for debugging / future use */
  htmlSnapshot?: string;
}

export interface PdfExtractionResult {
  checksumHex: string;
  byteSize: number;
  mimeType: string;
  /** Extracted text when pdf-parse succeeds */
  normalizedText: string | null;
  extractionDeferred: boolean;
  deferReason?: string;
}

export interface ReconciledSource {
  id: string;
  existed: boolean;
}

export interface IngestionServiceResult {
  ok: true;
  job: {
    id: string;
    status: IngestionJobStatus;
    errorMessage: string | null;
  };
  /** Null when the job ended before a source row existed (e.g. skipped unsupported type). */
  source: {
    id: string;
    sourceType: SourceType;
    canonicalUrl: string | null;
    contentHash: string | null;
    existed: boolean;
  } | null;
  content?: {
    contentKind: ContentKind;
    characterCount: number | null;
    tokenEstimate: number | null;
    extractionDeferred?: boolean;
  };
  artifact?: {
    id: string;
    storagePath: string;
    checksum: string | null;
  };
  summary: string;
}

export interface IngestionServiceError {
  ok: false;
  code: "validation" | "configuration" | "fetch" | "database" | "internal";
  message: string;
  httpStatus: number;
  /** e.g. jobId when a row was created before failure */
  details?: Record<string, unknown>;
}
