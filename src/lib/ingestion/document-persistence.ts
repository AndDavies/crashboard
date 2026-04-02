/**
 * v2 repository write path: inserts into `documents`, `document_captures`, `tags`,
 * `document_tags`, and `document_links` only. No chunking, embeddings, or legacy tables.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/ingestion/hash";
import { normalizeTextForStorage } from "@/lib/ingestion/normalize";
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

/**
 * This module is legacy / reference code for a previous structured payload shape.
 * It is not used by the current runtime ingestion path, but Next's typecheck still
 * covers it. Treat payloads as `any` to avoid coupling this file to the active
 * schema types.
 */
type LooseStructuredBody = any;
type LooseStructuredBodyWithFanout = any;

function effectiveContentHash(body: LooseStructuredBody): string | null {
  const d = body.document as Record<string, unknown>;
  const provided = typeof d.content_hash === "string" ? d.content_hash.trim() : "";
  if (provided) return provided;
  const basis =
    normalizeTextForStorage(
      (typeof d.content_text === "string" ? d.content_text : null) ??
        (typeof d.content_markdown === "string" ? d.content_markdown : null) ??
        (typeof d.transcript_text === "string" ? d.transcript_text : null) ??
        (typeof (body as any).document?.content === "string"
          ? (body as any).document.content
          : ""),
    ) ?? "";
  if (!basis) return null;
  return sha256Hex(basis);
}

function deriveCanonicalKey(body: LooseStructuredBody): string | null {
  const d = body.document as Record<string, unknown>;
  const explicit =
    typeof d.canonical_key === "string" ? d.canonical_key.trim() : "";
  if (explicit) return explicit;
  const externalId =
    typeof d.external_id === "string" ? d.external_id.trim() : "";
  const sourceType = (d.source_type ?? (body as any).document?.source_type) as
    | string
    | undefined;
  if (externalId && sourceType) return `${sourceType}:${externalId}`;
  const canonicalUrl =
    typeof d.canonical_url === "string" ? d.canonical_url.trim() : "";
  if (canonicalUrl) return canonicalUrl.toLowerCase();
  const originalUrl =
    typeof d.original_url === "string"
      ? d.original_url.trim()
      : typeof (body as any).document?.url === "string"
        ? (body as any).document.url.trim()
        : "";
  return originalUrl ? originalUrl.toLowerCase() : null;
}

function mergeDocumentMetadata(
  body: LooseStructuredBodyWithFanout,
): Record<string, unknown> {
  const d = body.document as Record<string, unknown>;
  const base = {
    ...(typeof d.metadata === "object" && d.metadata !== null ? d.metadata : {}),
  } as Record<string, unknown>;
  const related = (body as any).related_urls;
  if (Array.isArray(related) && related.length) base.related_urls = related;
  if ((body as any).fanout) base.fanout = (body as any).fanout;
  return base;
}

function captureSource(
  body: LooseStructuredBody,
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
  body: LooseStructuredBody,
  canonicalKey: string | null,
): Promise<string | null> {
  const d = body.document as Record<string, unknown>;
  const externalId =
    typeof d.external_id === "string" ? d.external_id.trim() : "";
  if (externalId) {
    const byExternal = await admin
      .from("documents")
      .select("id")
      .eq(
        "source_type",
        (d.source_type ?? (body as any).document?.source_type) as string,
      )
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

  const canonicalUrl =
    typeof d.canonical_url === "string" ? d.canonical_url.trim() : "";
  if (canonicalUrl) {
    const byCanonicalUrl = await admin
      .from("documents")
      .select("id")
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();
    if (byCanonicalUrl.error) throw new Error(byCanonicalUrl.error.message);
    if (byCanonicalUrl.data?.id) return byCanonicalUrl.data.id as string;
  }

  const originalUrl =
    typeof d.original_url === "string"
      ? d.original_url.trim()
      : typeof (body as any).document?.url === "string"
        ? (body as any).document.url.trim()
        : "";
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
  body: any,
): Promise<PersistStructuredResult> {
  const loose = body as unknown as LooseStructuredBody;
  const d = body.document as any;
  const nowIso = new Date().toISOString();
  const legacyDoc = (loose.document ?? {}) as Record<string, unknown>;
  const originalUrl =
    typeof (legacyDoc.original_url as any) === "string"
      ? String(legacyDoc.original_url)
      : typeof (d as any).url === "string"
        ? String((d as any).url)
        : "";
  const urlHost = extractUrlHost(originalUrl);
  const hash = effectiveContentHash(loose);
  const reviewStatus = d.review_status ?? "inbox";
  const ingestionStatus = d.ingestion_status ?? "ready";
  const canonicalKey = deriveCanonicalKey(loose);

  const docRow = {
    source_type: d.source_type,
    original_url: originalUrl.trim(),
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
    metadata: mergeDocumentMetadata(loose),
    quality_flags: (d.quality_flags ?? {}) as Record<string, unknown>,
    captured_at: nowIso,
    updated_at: nowIso,
  };

  const existingDocumentId = await findExistingDocumentId(
    admin,
    loose,
    canonicalKey,
  );

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
  const cap = (body as any).capture;
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
