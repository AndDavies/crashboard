/**
 * v2 repository write path: inserts into `documents`, `document_captures`, `tags`,
 * `document_tags`, and `document_links` only. No chunking, embeddings, or legacy tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/ingestion/hash";
import { normalizeTextForStorage } from "@/lib/ingestion/normalize";
import type { StructuredIngestionBody } from "@/lib/ingestion/structured-schema";
import {
  coerceTelegramId,
  extractUrlHost,
  mapLeroyTypeToTagType,
  normalizeLinkRelation,
  normalizeLeroyTagLabel,
  normalizeUserTagLabel,
  type PkbCaptureSource,
  type PkbDocumentTagSource,
  type PkbTagType,
} from "@/lib/ingestion/document-helpers";

export type PersistStructuredResult = {
  documentId: string;
  counts: {
    captures: number;
    tagRowsCreated: number;
    documentTagsCreated: number;
    linksCreated: number;
  };
};

function effectiveContentHash(body: StructuredIngestionBody): string | null {
  const provided = body.document.content_hash?.trim();
  if (provided) return provided;
  const basis =
    normalizeTextForStorage(
      body.document.content_text ??
        body.document.content_markdown ??
        body.document.transcript_text ??
        "",
    ) ?? "";
  if (!basis) return null;
  return sha256Hex(basis);
}

function deriveCanonicalKey(body: StructuredIngestionBody): string | null {
  const explicit = body.document.canonical_key?.trim();
  if (explicit) return explicit;
  const externalId = body.document.external_id?.trim();
  if (externalId) return `${body.document.source_type}:${externalId}`;
  const canonicalUrl = body.document.canonical_url?.trim();
  if (canonicalUrl) return canonicalUrl.toLowerCase();
  const originalUrl = body.document.original_url.trim();
  return originalUrl ? originalUrl.toLowerCase() : null;
}

function mergeDocumentMetadata(
  body: StructuredIngestionBody,
): Record<string, unknown> {
  const base = { ...(body.document.metadata ?? {}) } as Record<string, unknown>;
  if (body.related_urls?.length) base.related_urls = body.related_urls;
  if (body.fanout) base.fanout = body.fanout;
  return base;
}

function captureSource(
  body: StructuredIngestionBody,
): PkbCaptureSource {
  const raw = body.capture?.capture_source?.trim().toLowerCase();
  if (
    raw === "telegram" ||
    raw === "import" ||
    raw === "manual" ||
    raw === "api"
  ) {
    return raw;
  }
  return "api";
}

async function getOrCreateTag(
  admin: SupabaseClient,
  tag: string,
  tag_normalized: string,
  tag_type: PkbTagType,
): Promise<{ id: string; created: boolean }> {
  const sel = await admin
    .from("tags")
    .select("id")
    .eq("tag_normalized", tag_normalized)
    .eq("tag_type", tag_type)
    .maybeSingle();

  if (sel.error) throw new Error(sel.error.message);
  if (sel.data?.id) return { id: sel.data.id as string, created: false };

  const ins = await admin
    .from("tags")
    .insert({ tag, tag_normalized, tag_type })
    .select("id")
    .single();

  if (!ins.error && ins.data?.id) {
    return { id: ins.data.id as string, created: true };
  }

  const race = await admin
    .from("tags")
    .select("id")
    .eq("tag_normalized", tag_normalized)
    .eq("tag_type", tag_type)
    .maybeSingle();
  if (race.error) throw new Error(race.error.message);
  if (!race.data?.id) throw new Error(ins.error?.message ?? "tag insert failed");
  return { id: race.data.id as string, created: false };
}

async function findExistingDocumentId(
  admin: SupabaseClient,
  body: StructuredIngestionBody,
  canonicalKey: string | null,
): Promise<string | null> {
  const externalId = body.document.external_id?.trim();
  if (externalId) {
    const byExternal = await admin
      .from("documents")
      .select("id")
      .eq("source_type", body.document.source_type)
      .eq("external_id", externalId)
      .maybeSingle();
    if (byExternal.error) throw new Error(byExternal.error.message);
    if (byExternal.data?.id) return byExternal.data.id as string;
  }

  if (canonicalKey) {
    const byKey = await admin
      .from("documents")
      .select("id")
      .eq("canonical_key", canonicalKey)
      .maybeSingle();
    if (byKey.error) throw new Error(byKey.error.message);
    if (byKey.data?.id) return byKey.data.id as string;
  }

  const canonicalUrl = body.document.canonical_url?.trim();
  if (canonicalUrl) {
    const byCanonicalUrl = await admin
      .from("documents")
      .select("id")
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();
    if (byCanonicalUrl.error) throw new Error(byCanonicalUrl.error.message);
    if (byCanonicalUrl.data?.id) return byCanonicalUrl.data.id as string;
  }

  const originalUrl = body.document.original_url.trim();
  const byOriginalUrl = await admin
    .from("documents")
    .select("id")
    .eq("original_url", originalUrl)
    .maybeSingle();
  if (byOriginalUrl.error) throw new Error(byOriginalUrl.error.message);
  if (byOriginalUrl.data?.id) return byOriginalUrl.data.id as string;

  return null;
}

export async function persistStructuredDocumentV2(
  admin: SupabaseClient,
  body: StructuredIngestionBody,
): Promise<PersistStructuredResult> {
  const d = body.document;
  const nowIso = new Date().toISOString();
  const urlHost = extractUrlHost(d.original_url);
  const hash = effectiveContentHash(body);
  const reviewStatus = d.review_status ?? "inbox";
  const ingestionStatus = d.ingestion_status ?? "ready";
  const canonicalKey = deriveCanonicalKey(body);

  const docRow = {
    source_type: d.source_type,
    original_url: d.original_url.trim(),
    canonical_url: d.canonical_url?.trim() || null,
    url_host: urlHost,
    external_id: d.external_id?.trim() || null,
    title: d.title?.trim() || null,
    author_name: d.author_name?.trim() || null,
    publisher_name: d.publisher_name?.trim() || null,
    language: d.language?.trim() || null,
    published_at: d.published_at?.trim() || null,
    content_text: d.content_text?.trim() || null,
    content_markdown: d.content_markdown?.trim() || null,
    transcript_text: d.transcript_text?.trim() || null,
    summary_short: d.summary_short?.trim() || null,
    summary_medium: null,
    review_status: reviewStatus,
    ingestion_status: ingestionStatus,
    extraction_method: d.extraction_method.trim(),
    extraction_version: d.extraction_version?.trim() || null,
    content_hash: hash,
    canonical_key: canonicalKey,
    metadata: mergeDocumentMetadata(body),
    quality_flags: (d.quality_flags ?? {}) as Record<string, unknown>,
    captured_at: nowIso,
    updated_at: nowIso,
  };

  const existingDocumentId = await findExistingDocumentId(admin, body, canonicalKey);

  let documentId: string;
  if (existingDocumentId) {
    const docUpd = await admin
      .from("documents")
      .update(docRow)
      .eq("id", existingDocumentId)
      .select("id")
      .single();
    if (docUpd.error) throw new Error(docUpd.error.message);
    documentId = docUpd.data!.id as string;
  } else {
    const docIns = await admin
      .from("documents")
      .insert(docRow)
      .select("id")
      .single();
    if (docIns.error) throw new Error(docIns.error.message);
    documentId = docIns.data!.id as string;
  }

  const capSrc = captureSource(body);
  const cap = body.capture;
  const captureMeta: Record<string, unknown> = {
    ...(cap?.metadata ?? {}),
  };

  const capIns = await admin.from("document_captures").insert({
    document_id: documentId,
    capture_source: capSrc,
    chat_id: coerceTelegramId(cap?.chat_id),
    message_id: coerceTelegramId(cap?.message_id),
    thread_id: coerceTelegramId(cap?.thread_id),
    sender_id: coerceTelegramId(cap?.sender_id),
    sender_label: cap?.sender_label?.trim() || null,
    raw_text: cap?.raw_text?.trim() || null,
    captured_at: nowIso,
    metadata: captureMeta,
  });

  if (capIns.error) throw new Error(capIns.error.message);

  let tagRowsCreated = 0;
  let documentTagsCreated = 0;

  type TagIntent = {
    rawLabel: string;
    tagType: PkbTagType;
    joinSource: PkbDocumentTagSource;
    confidence: number | null;
    joinMeta: Record<string, unknown>;
  };

  const intents: TagIntent[] = [];

  for (const t of body.tags?.user_tags ?? []) {
    if (!normalizeUserTagLabel(t).tag_normalized) continue;
    intents.push({
      rawLabel: t,
      tagType: "user_hashtag",
      joinSource: "telegram_hashtag",
      confidence: null,
      joinMeta: {},
    });
  }

  for (const lt of body.tags?.leroy_tags ?? []) {
    const raw = lt.tag?.trim();
    if (!raw) continue;
    if (!normalizeLeroyTagLabel(raw).tag_normalized) continue;
    const tagType = mapLeroyTypeToTagType(lt.type);
    intents.push({
      rawLabel: raw,
      tagType,
      joinSource: "leroy",
      confidence:
        lt.confidence === null || lt.confidence === undefined
          ? null
          : lt.confidence,
      joinMeta: { leroy_type: lt.type ?? null },
    });
  }

  const seenTagKeys = new Set<string>();
  for (const intent of intents) {
    const normalized =
      intent.joinSource === "telegram_hashtag"
        ? normalizeUserTagLabel(intent.rawLabel)
        : normalizeLeroyTagLabel(intent.rawLabel);
    if (!normalized.tag_normalized) continue;

    const dedupeKey = `${intent.joinSource}:${intent.tagType}:${normalized.tag_normalized}`;
    if (seenTagKeys.has(dedupeKey)) continue;
    seenTagKeys.add(dedupeKey);

    const { id: tagId, created } = await getOrCreateTag(
      admin,
      normalized.tag,
      normalized.tag_normalized,
      intent.tagType,
    );
    if (created) tagRowsCreated += 1;

    const dtIns = await admin.from("document_tags").upsert(
      {
        document_id: documentId,
        tag_id: tagId,
        source: intent.joinSource,
        confidence: intent.confidence,
        metadata: intent.joinMeta,
      },
      { onConflict: "document_id,tag_id,source" },
    );
    if (dtIns.error) throw new Error(dtIns.error.message);
    documentTagsCreated += 1;
  }

  let linksCreated = 0;
  const relation = normalizeLinkRelation(body.fanout?.relation);
  const linkMetaBase: Record<string, unknown> = {};
  if (body.fanout) linkMetaBase.fanout = body.fanout;

  for (const url of body.related_urls ?? []) {
    const u = url.trim();
    if (!u) continue;

    const existingLink = await admin
      .from("document_links")
      .select("id")
      .eq("from_document_id", documentId)
      .eq("relation", relation)
      .eq("url", u)
      .maybeSingle();
    if (existingLink.error) throw new Error(existingLink.error.message);
    if (existingLink.data?.id) continue;

    const linkIns = await admin.from("document_links").insert({
      from_document_id: documentId,
      to_document_id: null,
      relation,
      url: u,
      metadata: { ...linkMetaBase },
    });
    if (linkIns.error) throw new Error(linkIns.error.message);
    linksCreated += 1;
  }

  return {
    documentId,
    counts: {
      captures: 1,
      tagRowsCreated,
      documentTagsCreated,
      linksCreated,
    },
  };
}
