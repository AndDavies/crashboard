import {
  INGESTION_ORIGIN_OPENCLAW,
  INGESTION_ORIGIN_TELEGRAM,
  TRIGGER_OPENCLAW_STRUCTURED,
} from "@/lib/ingestion/constants";
import { sha256Hex } from "@/lib/ingestion/hash";
import {
  estimateTokensFromText,
  normalizeTextForStorage,
} from "@/lib/ingestion/normalize";
import {
  createIngestionRepository,
  mergeIngestionEventMetadata,
  type SourceRow,
} from "@/lib/ingestion/repository";
import type { StructuredIngestionBody } from "@/lib/ingestion/structured-schema";
import type { ContentKind, SourceType } from "@/lib/ingestion/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const STRUCTURED_EXTRACTION_FALLBACK = "leroy-structured-1";

export interface StructuredIngestSuccess {
  ok: true;
  /** True when an existing `sources` row was matched (canonical/hash/original_url). */
  deduped: boolean;
  /** When Telegram provenance existed: event row id (new or existing). */
  eventId?: string;
  /** True when Telegram event row already existed (same message key). */
  eventDeduped?: boolean;
  job: { id: string; status: "completed" };
  source: {
    id: string;
    sourceType: string;
    canonicalUrl: string | null;
    contentHash: string | null;
    existed: boolean;
  };
  content?: {
    contentKind: string;
    characterCount: number | null;
    tokenEstimate: number | null;
  };
  artifacts?: Array<{ id: string; storagePath: string }>;
  entityCount?: number;
  summary: string;
}

export interface StructuredIngestError {
  ok: false;
  code: "validation" | "configuration" | "database" | "internal";
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const o = err as { code?: string; message?: string };
  return (
    o.code === "23505" ||
    (o.message?.includes("duplicate key") ?? false) ||
    (o.message?.includes("sources_canonical_url_unique_idx") ?? false) ||
    (o.message?.includes("sources_content_hash_unique_idx") ?? false)
  );
}

function effectiveContentHash(body: StructuredIngestionBody): string | null {
  const provided = body.source.content_hash?.trim();
  if (provided) return provided;
  const c = body.content;
  const basis =
    c.normalized_text?.trim() ||
    c.raw_text?.trim() ||
    c.transcript_text?.trim() ||
    "";
  if (!basis) return null;
  return sha256Hex(normalizeTextForStorage(basis));
}

function resolveSourceOrigin(body: StructuredIngestionBody): string {
  const o = body.provenance?.origin?.trim();
  if (o) return o;
  if (body.provenance?.telegram) return INGESTION_ORIGIN_TELEGRAM;
  return INGESTION_ORIGIN_OPENCLAW;
}

function buildTriggerReference(body: StructuredIngestionBody): string {
  const tg = body.provenance?.telegram;
  if (tg) {
    const th = tg.thread_id ?? 0;
    return `openclaw:structured:telegram:${String(tg.chat_id)}:${th}:${String(tg.message_id)}`;
  }
  const h = effectiveContentHash(body);
  const c = body.source.canonical_url?.trim();
  const u = body.source.original_url.trim();
  return `openclaw:structured:${h ?? c ?? u}`;
}

function compactOpenclaw(
  o:
    | {
        agent?: string | null;
        orchestrator?: string | null;
        channel?: string | null;
        session_id?: string | null;
        event_id?: string | null;
        extracted_by?: string | null;
      }
    | undefined,
): Record<string, string> | undefined {
  if (!o) return undefined;
  const out: Record<string, string> = {};
  const pick = (raw: string | null | undefined, key: string) => {
    const v = raw?.trim();
    if (v) out[key] = v;
  };
  pick(o.agent ?? null, "agent");
  pick(o.orchestrator ?? null, "orchestrator");
  pick(o.channel ?? null, "channel");
  pick(o.session_id ?? null, "session_id");
  pick(o.event_id ?? null, "event_id");
  pick(o.extracted_by ?? null, "extracted_by");
  return Object.keys(out).length ? out : undefined;
}

function buildSourceMetadata(body: StructuredIngestionBody): Record<string, unknown> {
  const base = { ...(body.source.metadata ?? {}) } as Record<string, unknown>;
  if (body.related_urls?.length) base.related_urls = body.related_urls;
  if (body.fanout) base.fanout = body.fanout;
  if (body.provenance?.metadata) {
    Object.assign(base, { caller_provenance: body.provenance.metadata });
  }
  base.pathway = "openclaw-structured";
  const oc = compactOpenclaw(body.provenance?.openclaw);
  if (oc) base.openclaw = oc;
  if (body.provenance?.telegram) {
    base.telegram = {
      chat_id: body.provenance.telegram.chat_id,
      message_id: body.provenance.telegram.message_id,
      thread_id: body.provenance.telegram.thread_id ?? null,
    };
  }
  return base;
}

function buildEventMetadata(body: StructuredIngestionBody): Record<string, unknown> {
  const oc = body.provenance?.openclaw;
  const extractedBy =
    oc?.extracted_by?.trim() ||
    oc?.agent?.trim() ||
    "leroy";
  return {
    pathway: "openclaw-structured",
    extracted_by: extractedBy,
    openclaw: compactOpenclaw(oc) ?? {},
    telegram: body.provenance?.telegram
      ? {
          chat_id: body.provenance.telegram.chat_id,
          message_id: body.provenance.telegram.message_id,
          thread_id: body.provenance.telegram.thread_id ?? null,
          topic_id: body.provenance.telegram.topic_id ?? null,
          group_title: body.provenance.telegram.group_title ?? null,
        }
      : {},
    provenance: body.provenance?.metadata ?? {},
  };
}

async function reconcileStructuredSource(
  repo: ReturnType<typeof createIngestionRepository>,
  body: StructuredIngestionBody,
  origin: string,
  effectiveHash: string | null,
): Promise<{ row: SourceRow; existed: boolean }> {
  const s = body.source;
  const canonical = s.canonical_url?.trim() || null;
  const original = s.original_url.trim();
  const meta = buildSourceMetadata(body);

  let existing: SourceRow | null = null;
  if (canonical) {
    existing = await repo.findSourceByCanonicalUrl(canonical);
  }
  if (!existing && effectiveHash) {
    existing = await repo.findSourceByContentHash(effectiveHash);
  }
  if (!existing) {
    existing = await repo.findSourceByOriginalUrl(original);
  }

  if (existing) {
    const prev =
      typeof existing.metadata === "object" &&
      existing.metadata !== null &&
      !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};
    const mergedMeta = { ...prev, ...meta };
    const canonicalPatch =
      !existing.canonical_url && canonical ? canonical : undefined;

    const row = await repo.updateSource(existing.id, {
      source_type: s.source_type as SourceType,
      original_url: original,
      canonical_url: canonicalPatch,
      title: s.title ?? existing.title,
      author_name: s.author_name ?? existing.author_name,
      publisher_name: s.publisher_name ?? existing.publisher_name,
      language: s.language ?? existing.language,
      status: "ready",
      content_hash: effectiveHash ?? existing.content_hash,
      published_at: s.published_at ?? existing.published_at,
      metadata: mergedMeta,
      last_processed_at: new Date().toISOString(),
    });
    return { row, existed: true };
  }

  try {
    const row = await repo.insertSource({
      source_type: s.source_type as SourceType,
      origin,
      original_url: original,
      canonical_url: canonical,
      title: s.title ?? null,
      author_name: s.author_name ?? null,
      publisher_name: s.publisher_name ?? null,
      language: s.language ?? null,
      status: "ready",
      content_hash: effectiveHash,
      published_at: s.published_at ?? null,
      metadata: meta,
    });
    return { row, existed: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    let row: SourceRow | null = null;
    if (canonical) row = await repo.findSourceByCanonicalUrl(canonical);
    if (!row && effectiveHash) {
      row = await repo.findSourceByContentHash(effectiveHash);
    }
    if (!row) row = await repo.findSourceByOriginalUrl(original);
    if (!row) throw e;
    const prev =
      typeof row.metadata === "object" &&
      row.metadata !== null &&
      !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const mergedMeta = { ...prev, ...meta };
    const canonicalPatch =
      !row.canonical_url && canonical ? canonical : undefined;
    const updated = await repo.updateSource(row.id, {
      source_type: s.source_type as SourceType,
      original_url: original,
      canonical_url: canonicalPatch,
      title: s.title ?? row.title,
      author_name: s.author_name ?? row.author_name,
      publisher_name: s.publisher_name ?? row.publisher_name,
      language: s.language ?? row.language,
      status: "ready",
      content_hash: effectiveHash ?? row.content_hash,
      published_at: s.published_at ?? row.published_at,
      metadata: mergedMeta,
      last_processed_at: new Date().toISOString(),
    });
    return { row: updated, existed: true };
  }
}

/**
 * Persist agent-extracted content: no HTTP fetch. Optional Telegram `ingestion_events` row
 * shares the same dedupe key as Phase 1C/1D.
 */
export async function runStructuredIngestion(
  body: StructuredIngestionBody,
  admin: SupabaseClient,
): Promise<StructuredIngestSuccess | StructuredIngestError> {
  const repo = createIngestionRepository(admin);
  const origin = resolveSourceOrigin(body);
  const effectiveHash = effectiveContentHash(body);
  const contentKind = (body.content.content_kind ?? "primary") as ContentKind;
  const extractionVersion =
    body.content.extraction_version?.trim() || STRUCTURED_EXTRACTION_FALLBACK;

  let eventId: string | undefined;
  let eventDeduped = false;
  let jobId: string | null = null;

  try {
    if (body.provenance?.telegram) {
      const tg = body.provenance.telegram;
      const threadId = tg.thread_id ?? null;
      const inserted = await repo.tryInsertTelegramIngestionEvent({
        chat_id: tg.chat_id,
        thread_id: threadId,
        message_id: tg.message_id,
        sender_id: tg.sender_id ?? null,
        sender_label: tg.sender_label?.trim() || null,
        raw_text: tg.raw_text?.trim() || null,
        attachments: [],
        metadata: buildEventMetadata(body),
      });

      if (inserted) {
        eventId = inserted.id;
      } else {
        const existingEv = await repo.findTelegramEventByMessageKey({
          chatId: tg.chat_id,
          threadId,
          messageId: tg.message_id,
        });
        if (existingEv) {
          eventId = existingEv.id;
          eventDeduped = true;
          const merged = mergeIngestionEventMetadata(
            existingEv.metadata,
            buildEventMetadata(body),
          );
          await repo.updateIngestionEvent(existingEv.id, {
            metadata: merged as Record<string, unknown>,
            raw_text: tg.raw_text?.trim() ?? existingEv.raw_text,
          });
        }
      }
    }

    const job = await repo.createJob({
      source_id: null,
      trigger_type: TRIGGER_OPENCLAW_STRUCTURED,
      trigger_reference: buildTriggerReference(body),
    });
    jobId = job.id;
    await repo.markJobProcessing(jobId);

    const { row: sourceRow, existed: sourceExisted } =
      await reconcileStructuredSource(repo, body, origin, effectiveHash);
    await repo.setJobSourceId(jobId, sourceRow.id);

    const c = body.content;
    const norm =
      c.normalized_text?.trim() ||
      normalizeTextForStorage(
        c.raw_text?.trim() ||
          c.transcript_text?.trim() ||
          c.markdown?.trim() ||
          c.html?.trim() ||
          "",
      );
    const charCount = norm.length > 0 ? norm.length : null;
    const tokens =
      charCount !== null ? estimateTokensFromText(norm) : null;

    await repo.supersedeCurrentContent(sourceRow.id, contentKind);
    await repo.insertSourceContent({
      source_id: sourceRow.id,
      content_kind: contentKind,
      raw_text: c.raw_text?.trim() || null,
      normalized_text: norm.length > 0 ? norm : null,
      markdown: c.markdown?.trim() || null,
      html: c.html?.trim() || null,
      transcript_text: c.transcript_text?.trim() || null,
      extraction_method: c.extraction_method.trim(),
      extraction_version: extractionVersion,
      token_estimate: tokens,
      character_count: charCount,
      quality_flags: c.quality_flags ?? {},
      metadata: {
        ...(c.metadata ?? {}),
        pathway: "openclaw-structured",
      },
    });

    const artifactResults: Array<{ id: string; storagePath: string }> = [];
    if (body.artifacts?.length) {
      for (const a of body.artifacts) {
        try {
          const { id } = await repo.insertArtifact({
            source_id: sourceRow.id,
            artifact_type: a.artifact_type,
            storage_path: a.storage_path.trim(),
            mime_type: a.mime_type?.trim() ?? null,
            byte_size: a.byte_size ?? null,
            checksum: a.checksum?.trim() ?? null,
            metadata: a.metadata ?? {},
          });
          artifactResults.push({ id, storagePath: a.storage_path.trim() });
        } catch (e) {
          if (isUniqueViolation(e)) {
            continue;
          }
          throw e;
        }
      }
    }

    let entityLinks = 0;
    if (body.entities?.length) {
      for (const ent of body.entities) {
        const et = ent.entity_type?.trim() || "unknown";
        let entRow = await repo.findEntityByLabelAndType(ent.label, et);
        if (!entRow) {
          entRow = await repo.insertEntity({
            label: ent.label,
            entity_type: et,
            metadata: ent.metadata ?? {},
          });
        }
        const linked = await repo.tryInsertSourceEntity({
          source_id: sourceRow.id,
          entity_id: entRow.id,
          role: ent.role?.trim() || "mentioned",
          confidence: ent.confidence ?? null,
          span_start: ent.span_start ?? null,
          span_end: ent.span_end ?? null,
          metadata: ent.metadata ?? {},
        });
        if (linked) entityLinks += 1;
      }
    }

    if (eventId) {
      const ev = await repo.getIngestionEventById(eventId);
      if (ev) {
        const merged = mergeIngestionEventMetadata(ev.metadata, {
          last_structured_ingestion: {
            at: new Date().toISOString(),
            job_id: jobId,
            source_id: sourceRow.id,
            content_kind: contentKind,
          },
        });
        await repo.updateIngestionEvent(eventId, {
          source_id: sourceRow.id,
          ingestion_job_id: jobId,
          metadata: merged as Record<string, unknown>,
        });
      }
    }

    await repo.markJobCompleted(jobId);

    return {
      ok: true,
      deduped: sourceExisted,
      eventId,
      ...(eventDeduped ? { eventDeduped: true } : {}),
      job: { id: jobId, status: "completed" },
      source: {
        id: sourceRow.id,
        sourceType: sourceRow.source_type,
        canonicalUrl: sourceRow.canonical_url,
        contentHash: sourceRow.content_hash,
        existed: sourceExisted,
      },
      content: {
        contentKind,
        characterCount: charCount,
        tokenEstimate: tokens,
      },
      artifacts:
        artifactResults.length > 0 ? artifactResults : undefined,
      entityCount: entityLinks > 0 ? entityLinks : undefined,
      summary: sourceExisted
        ? "Structured payload stored; source updated, new current content row written."
        : "Structured payload stored; new source and content created.",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Structured ingestion failed.";
    if (jobId) {
      try {
        await repo.markJobFailed(jobId, message, {
          name: e instanceof Error ? e.name : "Error",
        });
      } catch {
        /* ignore secondary failure */
      }
    }
    return {
      ok: false,
      code: "database",
      message,
      httpStatus: 500,
      details: { name: e instanceof Error ? e.name : "Error", jobId },
    };
  }
}
