/**
 * Helpers for Personal Knowledgebase v2 repository writes (documents, tags, links).
 */

/** tag_type on public.tags — see docs/SCHEMA.md */
export type PkbTagType =
  | "user_hashtag"
  | "leroy_keyword"
  | "topic"
  | "project"
  | "entity_hint";

/** document_tags.source */
export type PkbDocumentTagSource = "telegram_hashtag" | "leroy" | "manual";

/** document_captures.capture_source */
export type PkbCaptureSource = "telegram" | "import" | "manual" | "api";

/** document_links.relation */
export type PkbLinkRelation =
  | "linked_article"
  | "duplicate_of"
  | "canonical_of"
  | "mentioned_in";

const LEROY_TYPE_MAP: Record<string, PkbTagType> = {
  topic: "topic",
  project: "project",
  entity: "entity_hint",
  entity_hint: "entity_hint",
  entity_person: "entity_hint",
  entity_company: "entity_hint",
  entity_concept: "entity_hint",
  keyword: "leroy_keyword",
  leroy_keyword: "leroy_keyword",
  user_hashtag: "user_hashtag",
};

/**
 * Hostname from a canonical/original URL string; null if parsing fails.
 */
export function extractUrlHost(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return u.hostname.toLowerCase() || null;
  } catch {
    try {
      const u = new URL(t.startsWith("http") ? t : `https://${t}`);
      return u.hostname.toLowerCase() || null;
    } catch {
      return null;
    }
  }
}

/**
 * Normalize hashtag-style user tags: trim, strip leading #, lowercase, collapse whitespace.
 */
export function normalizeUserTagLabel(raw: string): {
  tag: string;
  tag_normalized: string;
} {
  let s = raw.trim();
  while (s.startsWith("#")) s = s.slice(1).trim();
  const tag_normalized = s.replace(/\s+/gu, " ").toLowerCase();
  return {
    tag: tag_normalized,
    tag_normalized,
  };
}

/**
 * Normalize Leroy tag text (no forced # strip unless present).
 */
export function normalizeLeroyTagLabel(raw: string): {
  tag: string;
  tag_normalized: string;
} {
  const tag_normalized = raw.trim().replace(/\s+/gu, " ").toLowerCase();
  return { tag: tag_normalized, tag_normalized };
}

/**
 * Map optional Leroy `type` string to a SCHEMA.md tag_type.
 */
export function mapLeroyTypeToTagType(
  type: string | null | undefined,
): PkbTagType {
  if (type == null || type === "") return "leroy_keyword";
  const key = type.trim().toLowerCase();
  return LEROY_TYPE_MAP[key] ?? "leroy_keyword";
}

export function coerceTelegramId(
  v: string | number | null | undefined,
): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  const s = String(v).trim();
  return s || null;
}

export function normalizeLinkRelation(
  raw: string | null | undefined,
): PkbLinkRelation {
  if (!raw?.trim()) return "mentioned_in";
  const r = raw.trim().toLowerCase();
  if (
    r === "linked_article" ||
    r === "duplicate_of" ||
    r === "canonical_of" ||
    r === "mentioned_in"
  ) {
    return r;
  }
  return "mentioned_in";
}
