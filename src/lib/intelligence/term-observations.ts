import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/ingestion/hash";
import { stripControlCharacters } from "@/lib/ingestion/normalize";

export const INTELLIGENCE_TERM_EXTRACTION_VERSION = "terms-v2.0.0";

export type IntelligenceTermKind = "keyword" | "phrase" | "acronym" | "identifier";

export type ExtractedTermObservation = {
  normalizedTerm: string;
  displayTerm: string;
  kind: IntelligenceTermKind;
  occurrenceCount: number;
  titleCount: number;
  editorialTokenCount: number;
  salience: number;
  supportingText: string;
};

const STOPWORDS = new Set([
  "about", "after", "again", "against", "also", "among", "another", "because",
  "been", "before", "being", "between", "both", "could", "daily", "during",
  "each", "email", "every", "first", "from", "have", "having", "into", "itself",
  "latest", "more", "most", "newsletter", "other", "over", "read", "report",
  "said", "should", "since", "some", "such", "than", "that", "their", "them",
  "then", "there", "these", "they", "this", "those", "through", "today", "under",
  "until", "very", "what", "when", "where", "which", "while", "will", "with",
  "would", "your", "announced", "announcement", "company", "companies", "industry",
  "market", "million", "billion", "system", "systems", "technology", "technologies",
  "new", "news", "week", "year", "years", "including", "using", "used",
  "http", "https", "across", "rather", "without", "around", "better", "already",
]);

const TECHNICAL_CUES = new Set([
  "aerospace", "autonomous", "autonomy", "counter-uas", "counter-uas", "cyber",
  "defence", "defense", "drone", "drones", "electronic", "hypersonic", "interceptor",
  "missile", "munitions", "procurement", "quantum", "radar", "satcom", "satellite",
  "semiconductor", "solicitation", "tender", "uncrewed", "unmanned", "warfare",
  "artificial", "intelligence", "machine", "learning", "command", "control",
]);

const TOKEN_PATTERN = /[\p{L}\p{N}]+(?:[-/.][\p{L}\p{N}]+)*/gu;

type Token = { raw: string; normalized: string };

function wellFormedText(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] + value[index + 1];
        index += 1;
      } else output += "�";
    } else if (code >= 0xdc00 && code <= 0xdfff) output += "�";
    else output += value[index];
  }
  return output;
}

function compact(value: string) {
  return wellFormedText(stripControlCharacters(value))
    .normalize("NFKC")
    .replace(/[‐‑‒–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeTerm(value: string) {
  return compact(value)
    .toLocaleLowerCase("en-CA")
    .replace(/(^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$)/gu, "");
}

function tokenize(value: string): Token[] {
  return [...compact(value).matchAll(TOKEN_PATTERN)].map((match) => ({
    raw: match[0],
    normalized: normalizeTerm(match[0]),
  })).filter((token) => Boolean(token.normalized));
}

function isIdentifier(raw: string) {
  return (
    /\p{L}/u.test(raw) && /\d/u.test(raw) && /[-/.]/u.test(raw)
  ) || /^(?:rf[piq]|sol|bid|lot)[-/.]?\d[\p{L}\p{N}./-]*$/iu.test(raw);
}

function isAcronym(raw: string) {
  const letters = raw.replace(/[^\p{L}]/gu, "");
  const uppercase = [...letters].filter((character) =>
    character === character.toLocaleUpperCase("en-CA") &&
    character !== character.toLocaleLowerCase("en-CA")
  ).length;
  return (
    letters.length >= 2 && letters.length <= 12 && uppercase >= 2 &&
    (uppercase === letters.length || /^[A-Z][a-z]?[A-Z]/u.test(letters))
  );
}

function isContentToken(token: Token) {
  return (
    token.normalized.length >= 3 || isIdentifier(token.raw) || isAcronym(token.raw)
  ) && !STOPWORDS.has(token.normalized);
}

function isTechnicalToken(token: Token) {
  return TECHNICAL_CUES.has(token.normalized) || isIdentifier(token.raw) || isAcronym(token.raw);
}

export function isTrendEligibleNormalizedTerm(value: string) {
  const tokens = tokenize(value);
  return tokens.length > 0 &&
    !STOPWORDS.has(tokens[0]!.normalized) &&
    !STOPWORDS.has(tokens.at(-1)!.normalized);
}

function countSequence(tokens: Token[], normalizedParts: string[]) {
  let count = 0;
  for (let index = 0; index <= tokens.length - normalizedParts.length; index += 1) {
    if (normalizedParts.every((part, offset) => tokens[index + offset]?.normalized === part)) {
      count += 1;
    }
  }
  return count;
}

function supportingText(content: string, normalizedParts: string[]) {
  const sentences = compact(content).split(/(?<=[.!?])\s+/u);
  const match = sentences.find((sentence) => {
    const normalized = normalizeTerm(sentence);
    return normalizedParts.every((part) => normalized.includes(part));
  });
  return (match ?? sentences[0] ?? "").slice(0, 320);
}

function betterDisplay(current: string | undefined, candidate: string) {
  if (!current) return candidate;
  if (isAcronym(candidate) && !isAcronym(current)) return candidate;
  return current.length <= candidate.length ? current : candidate;
}

export function extractTermObservations(input: {
  title?: string | null;
  contentText: string;
  tokenCount?: number;
  maxTerms?: number;
}): ExtractedTermObservation[] {
  const titleTokens = tokenize(input.title ?? "");
  const contentTokens = tokenize(input.contentText);
  const editorialTokenCount = Math.max(input.tokenCount ?? 0, contentTokens.length);
  const candidates = new Map<string, { parts: string[]; display: string; kind: IntelligenceTermKind }>();

  for (const token of contentTokens) {
    if (!isContentToken(token)) continue;
    const kind: IntelligenceTermKind = isIdentifier(token.raw)
      ? "identifier"
      : isAcronym(token.raw)
        ? "acronym"
        : "keyword";
    if (kind === "keyword" && token.normalized.length < 5) continue;
    const key = `${kind}:${token.normalized}`;
    const previous = candidates.get(key);
    candidates.set(key, {
      parts: [token.normalized],
      display: betterDisplay(previous?.display, token.raw),
      kind,
    });
  }

  const sentenceTokens = compact(input.contentText)
    .split(/(?<=[.!?;:])\s+|\n+/u)
    .map(tokenize);
  for (const tokens of sentenceTokens) {
    for (let length = 2; length <= 5; length += 1) {
      for (let index = 0; index <= tokens.length - length; index += 1) {
        const window = tokens.slice(index, index + length);
        if (!isContentToken(window[0]) || !isContentToken(window.at(-1)!)) continue;
        if (window.filter(isContentToken).length < Math.ceil(length * 0.7)) continue;
        const namedSequence = window.filter((token) => /^[A-Z]/u.test(token.raw)).length >= 2;
        if (!namedSequence && !window.some(isTechnicalToken)) continue;
        const normalized = window.map((token) => token.normalized).join(" ");
        const key = `phrase:${normalized}`;
        if (!candidates.has(key)) {
          candidates.set(key, {
            parts: window.map((token) => token.normalized),
            display: window.map((token) => token.raw).join(" "),
            kind: "phrase",
          });
        }
      }
    }
  }

  const observations = [...candidates.values()].map((candidate) => {
    const occurrenceCount = countSequence(contentTokens, candidate.parts);
    const titleCount = countSequence(titleTokens, candidate.parts);
    const cappedOccurrences = Math.min(5, occurrenceCount);
    const special = candidate.kind === "identifier" || candidate.kind === "acronym" ? 0.2 : 0;
    const salience = Math.min(
      1,
      cappedOccurrences * 0.1 + Math.min(1, titleCount) * 0.35 +
        Math.min(0.2, candidate.parts.length * 0.04) + special,
    );
    return {
      normalizedTerm: candidate.parts.join(" "),
      displayTerm: candidate.display,
      kind: candidate.kind,
      occurrenceCount,
      titleCount,
      editorialTokenCount,
      salience: Number(salience.toFixed(6)),
      supportingText: supportingText(input.contentText, candidate.parts),
    };
  }).filter((observation) => observation.occurrenceCount > 0);

  return observations
    .sort((a, b) =>
      b.salience - a.salience ||
      b.titleCount - a.titleCount ||
      b.occurrenceCount - a.occurrenceCount ||
      a.normalizedTerm.localeCompare(b.normalizedTerm)
    )
    .slice(0, Math.min(Math.max(input.maxTerms ?? 80, 1), 120));
}

type TermBackfillRow = {
  id: string;
  document_id: string;
  title: string | null;
  content_text: string;
  content_hash: string;
  token_count: number;
  document: {
    published_at: string | null;
    created_at: string;
    source_identity_id: string | null;
  };
};

function nestedDocument(value: unknown): TermBackfillRow["document"] | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as TermBackfillRow["document"];
}

export async function refreshTermObservationsBatch(
  admin: SupabaseClient,
  ownerId: string,
  options: { cursor?: number; limit?: number; segmentIds?: string[] } = {},
) {
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0));
  const explicitSegmentIds = options.segmentIds === undefined
    ? null
    : [...new Set(options.segmentIds.map(String).filter(Boolean))].slice(0, 625);
  const limit = explicitSegmentIds
    ? Math.max(1, explicitSegmentIds.length)
    : Math.min(250, Math.max(1, Math.floor(options.limit ?? 100)));
  if (explicitSegmentIds?.length === 0) {
    return {
      cursor,
      processed: 0,
      observationCount: 0,
      nextCursor: null,
      complete: true,
    };
  }
  let query = admin
    .from("intelligence_document_segments")
    .select("id,document_id,title,content_text,content_hash,token_count,documents!inner(published_at,created_at,source_identity_id)")
    .eq("owner_id", ownerId)
    .in("segment_type", ["editorial", "unknown"])
    .is("exclusion_reason", null);
  query = explicitSegmentIds
    ? query.in("id", explicitSegmentIds).order("id", { ascending: true })
    : query.order("id", { ascending: true }).range(cursor, cursor + limit - 1);
  const result = await query;
  if (result.error) {
    throw new Error(`term segment read failed at cursor ${cursor}: ${result.error.message}`);
  }

  const segmentIds = (result.data ?? []).map((row) => String(row.id));
  if (segmentIds.length) {
    // Clear every prior completion marker for these segments before changing
    // observations. A failed or partial write therefore cannot look complete.
    const clearState = await admin
      .from("intelligence_term_processing_state")
      .delete()
      .eq("owner_id", ownerId)
      .eq("extraction_version", INTELLIGENCE_TERM_EXTRACTION_VERSION)
      .in("segment_id", segmentIds);
    if (clearState.error) {
      throw new Error(`term completion-state reset failed for ${segmentIds.length} segments: ${clearState.error.message}`);
    }
    const remove = await admin
      .from("intelligence_term_observations")
      .delete()
      .eq("owner_id", ownerId)
      .eq("extraction_version", INTELLIGENCE_TERM_EXTRACTION_VERSION)
      .in("segment_id", segmentIds);
    if (remove.error) {
      throw new Error(`term observation reset failed for ${segmentIds.length} segments: ${remove.error.message}`);
    }
  }

  const rows = (result.data ?? []).flatMap((raw) => {
    const document = nestedDocument(raw.documents);
    if (!document) return [];
    const segmentId = String(raw.id);
    const documentId = String(raw.document_id);
    const observedOn = String(document.published_at ?? document.created_at).slice(0, 10);
    return extractTermObservations({
      title: typeof raw.title === "string" ? raw.title : null,
      contentText: String(raw.content_text),
      tokenCount: Number(raw.token_count ?? 0),
    }).map((term) => ({
      owner_id: ownerId,
      observation_key: sha256Hex(`${segmentId}|${term.kind}|${term.normalizedTerm}`),
      document_id: documentId,
      segment_id: segmentId,
      source_identity_id: document.source_identity_id
        ? wellFormedText(document.source_identity_id)
        : null,
      observed_on: wellFormedText(observedOn),
      normalized_term: wellFormedText(term.normalizedTerm),
      display_term: wellFormedText(term.displayTerm),
      term_kind: term.kind,
      occurrence_count: term.occurrenceCount,
      title_count: term.titleCount,
      editorial_token_count: term.editorialTokenCount,
      salience: term.salience,
      extraction_version: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      supporting_text: wellFormedText(term.supportingText),
      updated_at: new Date().toISOString(),
    }));
  });
  const safeRows = rows.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" ? wellFormedText(value) : value,
    ]),
  ));
  for (let index = 0; index < safeRows.length; index += 500) {
    const write = await admin.from("intelligence_term_observations").upsert(
      safeRows.slice(index, index + 500),
      { onConflict: "owner_id,observation_key" },
    );
    if (write.error) {
      throw new Error([
        write.error.message,
        write.error.details,
        write.error.hint,
        `term observation batch ${index}-${Math.min(index + 499, safeRows.length - 1)}`,
      ].filter(Boolean).join(" · "));
    }
  }

  // A completion marker is written only after every observation write above
  // succeeds. Zero-term segments are represented reliably as completed too.
  const completedAt = new Date().toISOString();
  const observationCountBySegment = new Map<string, number>();
  for (const row of rows) {
    observationCountBySegment.set(
      row.segment_id,
      (observationCountBySegment.get(row.segment_id) ?? 0) + 1,
    );
  }
  const stateRows = (result.data ?? []).flatMap((raw) => {
    const document = nestedDocument(raw.documents);
    if (!document) return [];
    return [{
      owner_id: ownerId,
      document_id: String(raw.document_id),
      segment_id: String(raw.id),
      content_hash: String(raw.content_hash),
      extraction_version: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      observation_count: observationCountBySegment.get(String(raw.id)) ?? 0,
      completed_at: completedAt,
      updated_at: completedAt,
    }];
  });
  if (stateRows.length) {
    const stateWrite = await admin.from("intelligence_term_processing_state").upsert(
      stateRows,
      { onConflict: "segment_id,content_hash,extraction_version" },
    );
    if (stateWrite.error) {
      throw new Error(`term completion-state write failed for ${stateRows.length} segments: ${stateWrite.error.message}`);
    }
  }

  const processed = result.data?.length ?? 0;
  return {
    cursor,
    processed,
    observationCount: rows.length,
    nextCursor: explicitSegmentIds ? null : processed === limit ? cursor + processed : null,
    complete: explicitSegmentIds ? true : processed < limit,
  };
}

export const __testables = {
  isAcronym,
  isIdentifier,
  normalizeTerm,
  tokenize,
};
