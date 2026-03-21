-- Phase 1: raw ingestion, normalized content, provenance, and job tracking.
-- Intentionally excludes chunking, embeddings, and semantic retrieval tables.

-- ---------------------------------------------------------------------------
-- Extensions (gen_random_uuid is available without extension on PG 13+)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE public.source_type AS ENUM (
  'article',
  'youtube_video',
  'x_post',
  'x_thread',
  'pdf',
  'note',
  'document',
  'unknown'
);

CREATE TYPE public.source_status AS ENUM (
  'draft',
  'pending',
  'ready',
  'failed',
  'archived'
);

CREATE TYPE public.content_kind AS ENUM (
  'primary',
  'transcript',
  'description',
  'ocr',
  'structured',
  'auxiliary'
);

CREATE TYPE public.ingestion_job_status AS ENUM (
  'queued',
  'processing',
  'completed',
  'failed',
  'retryable',
  'skipped'
);

CREATE TYPE public.ingestion_provider AS ENUM (
  'telegram',
  'manual',
  'api',
  'browser',
  'other'
);

CREATE TYPE public.artifact_type AS ENUM (
  'uploaded_pdf',
  'downloaded_pdf',
  'thumbnail',
  'transcript_file',
  'html_snapshot',
  'raw_html',
  'screenshot',
  'attachment',
  'other'
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- sources: one row per logical source item (identity + catalog fields)
-- ---------------------------------------------------------------------------

CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_type public.source_type NOT NULL DEFAULT 'unknown',
  origin text NOT NULL DEFAULT 'unknown',

  original_url text,
  canonical_url text,

  title text,
  author_name text,
  publisher_name text,
  language text,

  status public.source_status NOT NULL DEFAULT 'draft',

  content_hash text,

  published_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  last_processed_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sources_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TRIGGER sources_set_updated_at
BEFORE UPDATE ON public.sources
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX sources_status_ingested_at_idx
  ON public.sources (status, ingested_at DESC);

CREATE INDEX sources_source_type_idx
  ON public.sources (source_type);

CREATE INDEX sources_published_at_idx
  ON public.sources (published_at DESC NULLS LAST);

CREATE UNIQUE INDEX sources_canonical_url_unique_idx
  ON public.sources (canonical_url)
  WHERE canonical_url IS NOT NULL;

CREATE INDEX sources_original_url_idx
  ON public.sources (original_url)
  WHERE original_url IS NOT NULL;

CREATE UNIQUE INDEX sources_content_hash_unique_idx
  ON public.sources (content_hash)
  WHERE content_hash IS NOT NULL;

COMMENT ON TABLE public.sources IS
  'Canonical catalog row per ingested item; URLs and content_hash support deduplication and lookups.';

-- ---------------------------------------------------------------------------
-- source_contents: extracted/normalized body separate from source identity
-- ---------------------------------------------------------------------------

CREATE TABLE public.source_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_id uuid NOT NULL REFERENCES public.sources (id) ON DELETE CASCADE,

  content_kind public.content_kind NOT NULL DEFAULT 'primary',

  raw_text text,
  normalized_text text,
  markdown text,
  html text,
  transcript_text text,

  extraction_method text NOT NULL DEFAULT 'unknown',
  extraction_version text NOT NULL DEFAULT '1',

  token_estimate integer,
  character_count integer,

  quality_flags jsonb NOT NULL DEFAULT '{}'::jsonb,

  superseded_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT source_contents_quality_flags_is_object
    CHECK (jsonb_typeof(quality_flags) = 'object'),
  CONSTRAINT source_contents_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT source_contents_token_estimate_nonnegative
    CHECK (token_estimate IS NULL OR token_estimate >= 0),
  CONSTRAINT source_contents_character_count_nonnegative
    CHECK (character_count IS NULL OR character_count >= 0)
);

CREATE TRIGGER source_contents_set_updated_at
BEFORE UPDATE ON public.source_contents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX source_contents_one_current_per_kind_idx
  ON public.source_contents (source_id, content_kind)
  WHERE superseded_at IS NULL;

CREATE INDEX source_contents_source_id_created_at_idx
  ON public.source_contents (source_id, created_at DESC);

COMMENT ON TABLE public.source_contents IS
  'Normalized extracted text/HTML/markdown per source; superseded_at implements replacement without losing history.';

COMMENT ON COLUMN public.source_contents.superseded_at IS
  'NULL = current revision for this content_kind; set when a newer row supersedes this one.';

-- ---------------------------------------------------------------------------
-- ingestion_jobs: lifecycle and retries for pipeline work
-- ---------------------------------------------------------------------------

CREATE TABLE public.ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_id uuid REFERENCES public.sources (id) ON DELETE SET NULL,

  trigger_type text NOT NULL DEFAULT 'unknown',
  trigger_reference text,

  status public.ingestion_job_status NOT NULL DEFAULT 'queued',

  error_message text,
  error_details jsonb NOT NULL DEFAULT '{}'::jsonb,

  attempt_count integer NOT NULL DEFAULT 0,

  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingestion_jobs_error_details_is_object
    CHECK (jsonb_typeof(error_details) = 'object'),
  CONSTRAINT ingestion_jobs_attempt_count_nonnegative
    CHECK (attempt_count >= 0)
);

CREATE TRIGGER ingestion_jobs_set_updated_at
BEFORE UPDATE ON public.ingestion_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX ingestion_jobs_status_created_at_idx
  ON public.ingestion_jobs (status, created_at DESC);

CREATE INDEX ingestion_jobs_source_id_idx
  ON public.ingestion_jobs (source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON TABLE public.ingestion_jobs IS
  'Queue-style job record; source_id may be null until the source row exists.';

-- ---------------------------------------------------------------------------
-- ingestion_events: provenance (Telegram and future providers)
-- ---------------------------------------------------------------------------

CREATE TABLE public.ingestion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_id uuid REFERENCES public.sources (id) ON DELETE SET NULL,
  ingestion_job_id uuid REFERENCES public.ingestion_jobs (id) ON DELETE SET NULL,

  provider public.ingestion_provider NOT NULL DEFAULT 'other',

  chat_id bigint,
  thread_id bigint,
  message_id bigint,
  sender_id bigint,
  sender_label text,

  raw_text text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ingestion_events_attachments_is_array
    CHECK (jsonb_typeof(attachments) = 'array'),
  CONSTRAINT ingestion_events_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX ingestion_events_telegram_dedup_idx
  ON public.ingestion_events (provider, chat_id, thread_id, message_id)
  WHERE provider = 'telegram'
    AND chat_id IS NOT NULL
    AND message_id IS NOT NULL;

CREATE INDEX ingestion_events_source_id_idx
  ON public.ingestion_events (source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX ingestion_events_ingestion_job_id_idx
  ON public.ingestion_events (ingestion_job_id)
  WHERE ingestion_job_id IS NOT NULL;

CREATE INDEX ingestion_events_received_at_idx
  ON public.ingestion_events (received_at DESC);

COMMENT ON TABLE public.ingestion_events IS
  'Immutable-ish provenance: where a request came from (e.g. Telegram chat/topic/message).';

COMMENT ON COLUMN public.ingestion_events.attachments IS
  'JSON array summarizing attachments (type, name, size, storage reference, etc.).';

-- ---------------------------------------------------------------------------
-- source_artifacts: files in object storage or local paths
-- ---------------------------------------------------------------------------

CREATE TABLE public.source_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_id uuid NOT NULL REFERENCES public.sources (id) ON DELETE CASCADE,

  artifact_type public.artifact_type NOT NULL DEFAULT 'other',
  storage_path text NOT NULL,

  mime_type text,
  byte_size bigint,
  checksum text,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT source_artifacts_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT source_artifacts_byte_size_nonnegative
    CHECK (byte_size IS NULL OR byte_size >= 0)
);

CREATE INDEX source_artifacts_source_id_idx
  ON public.source_artifacts (source_id);

CREATE INDEX source_artifacts_source_type_idx
  ON public.source_artifacts (source_id, artifact_type);

CREATE UNIQUE INDEX source_artifacts_storage_path_unique_idx
  ON public.source_artifacts (storage_path);

COMMENT ON TABLE public.source_artifacts IS
  'Pointers to blobs (PDFs, HTML snapshots, thumbnails) with optional checksum for integrity.';

-- ---------------------------------------------------------------------------
-- Minimal entity scaffolding (optional extension points)
-- ---------------------------------------------------------------------------

CREATE TABLE public.entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  label text NOT NULL,
  entity_type text NOT NULL DEFAULT 'unknown',

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entities_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TRIGGER entities_set_updated_at
BEFORE UPDATE ON public.entities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX entities_entity_type_idx ON public.entities (entity_type);
CREATE INDEX entities_label_idx ON public.entities (label);

COMMENT ON TABLE public.entities IS
  'Lightweight entity stub for later NER/graph work; no canonicalization logic in Phase 1.';

CREATE TABLE public.source_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_id uuid NOT NULL REFERENCES public.sources (id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.entities (id) ON DELETE CASCADE,

  role text,
  confidence real,
  span_start integer,
  span_end integer,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT source_entities_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT source_entities_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0::real AND confidence <= 1::real)),
  CONSTRAINT source_entities_span_ordered
    CHECK (
      span_start IS NULL
      OR span_end IS NULL
      OR span_end >= span_start
    )
);

CREATE INDEX source_entities_source_id_idx ON public.source_entities (source_id);
CREATE INDEX source_entities_entity_id_idx ON public.source_entities (entity_id);

CREATE UNIQUE INDEX source_entities_source_entity_role_unique_idx
  ON public.source_entities (source_id, entity_id, role)
  WHERE role IS NOT NULL;

COMMENT ON TABLE public.source_entities IS
  'Join table linking sources to entities with optional role and rough text spans.';

-- ---------------------------------------------------------------------------
-- Row Level Security (enable; add policies when exposing to clients)
-- ---------------------------------------------------------------------------

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_entities ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS. For authenticated client access, create policies e.g.:
--   USING (owner_id = auth.uid())
-- after adding an owner column or join table.
