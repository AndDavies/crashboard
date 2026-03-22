import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArtifactType,
  ContentKind,
  IngestionJobStatus,
  SourceStatus,
  SourceType,
} from "@/lib/ingestion/types";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface SourceRow {
  id: string;
  source_type: SourceType;
  origin: string;
  original_url: string | null;
  canonical_url: string | null;
  title: string | null;
  author_name: string | null;
  publisher_name: string | null;
  language: string | null;
  status: SourceStatus;
  content_hash: string | null;
  published_at: string | null;
  ingested_at: string;
  last_processed_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

export interface IngestionJobRow {
  id: string;
  source_id: string | null;
  trigger_type: string;
  trigger_reference: string | null;
  status: IngestionJobStatus;
  error_message: string | null;
  error_details: Json;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IngestionEventRow {
  id: string;
  source_id: string | null;
  ingestion_job_id: string | null;
  provider: string;
  chat_id: number | null;
  thread_id: number | null;
  message_id: number | null;
  sender_id: number | null;
  sender_label: string | null;
  raw_text: string | null;
  attachments: Json;
  metadata: Json;
  received_at: string;
  created_at: string;
}

function asJsonObject(
  v: Record<string, unknown> | undefined,
): Record<string, Json> {
  if (!v) return {};
  const out: Record<string, Json> = {};
  for (const [k, val] of Object.entries(v)) {
    out[k] = val as Json;
  }
  return out;
}

export function mergeIngestionEventMetadata(
  existing: Json,
  patch: Record<string, unknown>,
): Record<string, Json> {
  return mergeJsonMetadata(existing, patch);
}

function mergeJsonMetadata(
  existing: Json,
  patch: Record<string, unknown>,
): Record<string, Json> {
  const base =
    existing &&
    typeof existing === "object" &&
    !Array.isArray(existing)
      ? (existing as Record<string, Json>)
      : {};
  return { ...base, ...asJsonObject(patch) };
}

export function createIngestionRepository(admin: SupabaseClient) {
  return {
    async findSourceByCanonicalUrl(
      canonicalUrl: string,
    ): Promise<SourceRow | null> {
      const { data, error } = await admin
        .from("sources")
        .select("*")
        .eq("canonical_url", canonicalUrl)
        .maybeSingle();
      if (error) throw new Error(`findSourceByCanonicalUrl: ${error.message}`);
      return data as SourceRow | null;
    },

    async findSourceByContentHash(
      contentHash: string,
    ): Promise<SourceRow | null> {
      const { data, error } = await admin
        .from("sources")
        .select("*")
        .eq("content_hash", contentHash)
        .maybeSingle();
      if (error) throw new Error(`findSourceByContentHash: ${error.message}`);
      return data as SourceRow | null;
    },

    /** Weaker identity than canonical/hash; first match wins. */
    async findSourceByOriginalUrl(
      originalUrl: string,
    ): Promise<SourceRow | null> {
      const { data, error } = await admin
        .from("sources")
        .select("*")
        .eq("original_url", originalUrl)
        .order("ingested_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`findSourceByOriginalUrl: ${error.message}`);
      return data as SourceRow | null;
    },

    async insertSource(payload: {
      source_type: SourceType;
      origin: string;
      original_url: string | null;
      canonical_url: string | null;
      title: string | null;
      author_name?: string | null;
      publisher_name: string | null;
      language: string | null;
      status: SourceStatus;
      content_hash: string | null;
      published_at?: string | null;
      metadata: Record<string, unknown>;
    }): Promise<SourceRow> {
      const { data, error } = await admin
        .from("sources")
        .insert({
          source_type: payload.source_type,
          origin: payload.origin,
          original_url: payload.original_url,
          canonical_url: payload.canonical_url,
          title: payload.title,
          author_name: payload.author_name ?? null,
          publisher_name: payload.publisher_name,
          language: payload.language,
          status: payload.status,
          content_hash: payload.content_hash,
          published_at: payload.published_at ?? null,
          metadata: asJsonObject(payload.metadata),
          last_processed_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      if (error) {
        const err = new Error(`insertSource: ${error.message}`) as Error & {
          code?: string;
        };
        err.code = error.code;
        throw err;
      }
      return data as SourceRow;
    },

    async updateSource(
      id: string,
      patch: {
        source_type?: SourceType;
        original_url?: string | null;
        canonical_url?: string | null;
        title?: string | null;
        author_name?: string | null;
        publisher_name?: string | null;
        language?: string | null;
        status?: SourceStatus;
        content_hash?: string | null;
        published_at?: string | null;
        metadata?: Record<string, unknown>;
        last_processed_at?: string;
      },
    ): Promise<SourceRow> {
      const row: Record<string, unknown> = {};
      if (patch.source_type !== undefined) row.source_type = patch.source_type;
      if (patch.original_url !== undefined) row.original_url = patch.original_url;
      if (patch.canonical_url !== undefined) row.canonical_url = patch.canonical_url;
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.author_name !== undefined) row.author_name = patch.author_name;
      if (patch.publisher_name !== undefined)
        row.publisher_name = patch.publisher_name;
      if (patch.language !== undefined) row.language = patch.language;
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.content_hash !== undefined) row.content_hash = patch.content_hash;
      if (patch.published_at !== undefined) row.published_at = patch.published_at;
      if (patch.last_processed_at !== undefined)
        row.last_processed_at = patch.last_processed_at;
      if (patch.metadata !== undefined) row.metadata = asJsonObject(patch.metadata);

      const { data, error } = await admin
        .from("sources")
        .update(row)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(`updateSource: ${error.message}`);
      return data as SourceRow;
    },

    async mergeSourceMetadata(
      id: string,
      existing: Json,
      patch: Record<string, unknown>,
    ): Promise<SourceRow> {
      const merged = mergeJsonMetadata(existing, patch);
      return this.updateSource(id, {
        metadata: merged as Record<string, unknown>,
        last_processed_at: new Date().toISOString(),
      });
    },

    async createJob(payload: {
      source_id: string | null;
      trigger_type: string;
      trigger_reference: string | null;
    }): Promise<IngestionJobRow> {
      const { data, error } = await admin
        .from("ingestion_jobs")
        .insert({
          source_id: payload.source_id,
          trigger_type: payload.trigger_type,
          trigger_reference: payload.trigger_reference,
          status: "queued",
          attempt_count: 0,
        })
        .select("*")
        .single();
      if (error) throw new Error(`createJob: ${error.message}`);
      return data as IngestionJobRow;
    },

    async setJobSourceId(jobId: string, sourceId: string): Promise<void> {
      const { error } = await admin
        .from("ingestion_jobs")
        .update({ source_id: sourceId })
        .eq("id", jobId);
      if (error) throw new Error(`setJobSourceId: ${error.message}`);
    },

    async markJobProcessing(jobId: string): Promise<IngestionJobRow> {
      const { data: current, error: selErr } = await admin
        .from("ingestion_jobs")
        .select("attempt_count")
        .eq("id", jobId)
        .single();
      if (selErr) throw new Error(`markJobProcessing(read): ${selErr.message}`);

      const nextAttempt = (current?.attempt_count ?? 0) + 1;
      const { data, error } = await admin
        .from("ingestion_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          attempt_count: nextAttempt,
        })
        .eq("id", jobId)
        .select("*")
        .single();
      if (error) throw new Error(`markJobProcessing: ${error.message}`);
      return data as IngestionJobRow;
    },

    async markJobCompleted(jobId: string): Promise<IngestionJobRow> {
      const { data, error } = await admin
        .from("ingestion_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", jobId)
        .select("*")
        .single();
      if (error) throw new Error(`markJobCompleted: ${error.message}`);
      return data as IngestionJobRow;
    },

    async markJobFailed(
      jobId: string,
      message: string,
      details?: Record<string, unknown>,
    ): Promise<IngestionJobRow> {
      const { data, error } = await admin
        .from("ingestion_jobs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: message,
          error_details: details ? asJsonObject(details) : {},
        })
        .eq("id", jobId)
        .select("*")
        .single();
      if (error) throw new Error(`markJobFailed: ${error.message}`);
      return data as IngestionJobRow;
    },

    async markJobSkipped(
      jobId: string,
      message: string,
      details?: Record<string, unknown>,
    ): Promise<IngestionJobRow> {
      const { data, error } = await admin
        .from("ingestion_jobs")
        .update({
          status: "skipped",
          completed_at: new Date().toISOString(),
          error_message: message,
          error_details: details ? asJsonObject(details) : {},
        })
        .eq("id", jobId)
        .select("*")
        .single();
      if (error) throw new Error(`markJobSkipped: ${error.message}`);
      return data as IngestionJobRow;
    },

    async supersedeCurrentContent(
      sourceId: string,
      contentKind: ContentKind,
    ): Promise<void> {
      const { error } = await admin
        .from("source_contents")
        .update({ superseded_at: new Date().toISOString() })
        .eq("source_id", sourceId)
        .eq("content_kind", contentKind)
        .is("superseded_at", null);
      if (error) throw new Error(`supersedeCurrentContent: ${error.message}`);
    },

    async insertSourceContent(payload: {
      source_id: string;
      content_kind: ContentKind;
      raw_text: string | null;
      normalized_text: string | null;
      markdown: string | null;
      html: string | null;
      transcript_text: string | null;
      extraction_method: string;
      extraction_version: string;
      token_estimate: number | null;
      character_count: number | null;
      quality_flags: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }): Promise<{ id: string }> {
      const { data, error } = await admin
        .from("source_contents")
        .insert({
          source_id: payload.source_id,
          content_kind: payload.content_kind,
          raw_text: payload.raw_text,
          normalized_text: payload.normalized_text,
          markdown: payload.markdown,
          html: payload.html,
          transcript_text: payload.transcript_text,
          extraction_method: payload.extraction_method,
          extraction_version: payload.extraction_version,
          token_estimate: payload.token_estimate,
          character_count: payload.character_count,
          quality_flags: asJsonObject(payload.quality_flags),
          metadata: asJsonObject(payload.metadata),
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertSourceContent: ${error.message}`);
      return { id: (data as { id: string }).id };
    },

    async insertArtifact(payload: {
      source_id: string;
      artifact_type: ArtifactType;
      storage_path: string;
      mime_type: string | null;
      byte_size: number | null;
      checksum: string | null;
      metadata: Record<string, unknown>;
    }): Promise<{ id: string }> {
      const { data, error } = await admin
        .from("source_artifacts")
        .insert({
          source_id: payload.source_id,
          artifact_type: payload.artifact_type,
          storage_path: payload.storage_path,
          mime_type: payload.mime_type,
          byte_size: payload.byte_size,
          checksum: payload.checksum,
          metadata: asJsonObject(payload.metadata),
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertArtifact: ${error.message}`);
      return { id: (data as { id: string }).id };
    },

    async getIngestionEventById(id: string): Promise<IngestionEventRow | null> {
      const { data, error } = await admin
        .from("ingestion_events")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`getIngestionEventById: ${error.message}`);
      return data as IngestionEventRow | null;
    },

    async findTelegramEventByMessageKey(params: {
      chatId: number | string;
      threadId: number | string | null;
      messageId: number | string;
    }): Promise<IngestionEventRow | null> {
      let q = admin
        .from("ingestion_events")
        .select("*")
        .eq("provider", "telegram")
        .eq("chat_id", params.chatId)
        .eq("message_id", params.messageId);
      if (params.threadId === null) {
        q = q.is("thread_id", null);
      } else {
        q = q.eq("thread_id", params.threadId);
      }
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`findTelegramEventByMessageKey: ${error.message}`);
      return data as IngestionEventRow | null;
    },

    /**
     * Insert Telegram provenance row. Returns null when another concurrent request
     * won the row (unique violation on chat/thread/message).
     */
    async tryInsertTelegramIngestionEvent(payload: {
      chat_id: number | string;
      thread_id: number | string | null;
      message_id: number | string;
      sender_id: number | string | null;
      sender_label: string | null;
      raw_text: string | null;
      attachments: Json;
      metadata: Record<string, unknown>;
    }): Promise<IngestionEventRow | null> {
      const { data, error } = await admin
        .from("ingestion_events")
        .insert({
          provider: "telegram",
          source_id: null,
          ingestion_job_id: null,
          chat_id: payload.chat_id,
          thread_id: payload.thread_id,
          message_id: payload.message_id,
          sender_id: payload.sender_id,
          sender_label: payload.sender_label,
          raw_text: payload.raw_text,
          attachments: payload.attachments,
          metadata: asJsonObject(payload.metadata),
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") return null;
        const err = new Error(
          `tryInsertTelegramIngestionEvent: ${error.message}`,
        ) as Error & { code?: string };
        err.code = error.code;
        throw err;
      }
      return data as IngestionEventRow;
    },

    async updateIngestionEvent(
      id: string,
      patch: {
        source_id?: string | null;
        ingestion_job_id?: string | null;
        metadata?: Record<string, unknown>;
        raw_text?: string | null;
      },
    ): Promise<void> {
      const row: Record<string, unknown> = {};
      if (patch.source_id !== undefined) row.source_id = patch.source_id;
      if (patch.ingestion_job_id !== undefined) {
        row.ingestion_job_id = patch.ingestion_job_id;
      }
      if (patch.metadata !== undefined) row.metadata = asJsonObject(patch.metadata);
      if (patch.raw_text !== undefined) row.raw_text = patch.raw_text;

      const { error } = await admin
        .from("ingestion_events")
        .update(row)
        .eq("id", id);
      if (error) throw new Error(`updateIngestionEvent: ${error.message}`);
    },

    async findEntityByLabelAndType(
      label: string,
      entityType: string,
    ): Promise<{ id: string } | null> {
      const { data, error } = await admin
        .from("entities")
        .select("id")
        .eq("label", label)
        .eq("entity_type", entityType)
        .maybeSingle();
      if (error) throw new Error(`findEntityByLabelAndType: ${error.message}`);
      return data as { id: string } | null;
    },

    async insertEntity(payload: {
      label: string;
      entity_type: string;
      metadata: Record<string, unknown>;
    }): Promise<{ id: string }> {
      const { data, error } = await admin
        .from("entities")
        .insert({
          label: payload.label,
          entity_type: payload.entity_type,
          metadata: asJsonObject(payload.metadata),
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertEntity: ${error.message}`);
      return { id: (data as { id: string }).id };
    },

    async tryInsertSourceEntity(payload: {
      source_id: string;
      entity_id: string;
      role: string | null;
      confidence: number | null;
      span_start: number | null;
      span_end: number | null;
      metadata: Record<string, unknown>;
    }): Promise<boolean> {
      const { error } = await admin.from("source_entities").insert({
        source_id: payload.source_id,
        entity_id: payload.entity_id,
        role: payload.role,
        confidence: payload.confidence,
        span_start: payload.span_start,
        span_end: payload.span_end,
        metadata: asJsonObject(payload.metadata),
      });
      if (error?.code === "23505") return false;
      if (error) throw new Error(`tryInsertSourceEntity: ${error.message}`);
      return true;
    },
  };
}

export type IngestionRepository = ReturnType<typeof createIngestionRepository>;
