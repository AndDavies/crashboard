import "server-only";

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireDashboardUser } from "@/lib/blog/data";
import {
  createEmbedding,
  createEmbeddings,
  INTELLIGENCE_EMBEDDING_MODEL,
} from "@/lib/intelligence/enrichment";
import { createAdminClient } from "@/lib/supabase/admin";
import { procurementEventProfileHref } from "@/lib/intelligence/catalog-profile";

export type IntelligenceSearchResult = {
  id: string;
  documentId: string;
  title: string;
  passage: string;
  url: string | null;
  publisher: string | null;
  publishedAt: string | null;
  sourceFamily: string | null;
  authority: string | null;
  storyId: string;
  whyMatched: string;
};

export type IntelligenceCatalogMatch = {
  id: string;
  kind: "topic" | "keyword" | "organization" | "system" | "programme" | "buying_opportunity";
  label: string;
  whyMatched: string;
  profileHref?: string;
};

function vectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

function compactQuery(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, 300);
}

function catalogKind(entityType: string) {
  if (entityType === "organization" || entityType === "government_agency") return "organization" as const;
  if (entityType === "program") return "programme" as const;
  if (entityType === "product_system" || entityType === "capability_technology") return "system" as const;
  return null;
}

async function catalogMatches(admin: SupabaseClient, ownerId: string, query: string) {
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const [concepts, aliases, entities, terms, procurements] = await Promise.all([
    admin.from("intelligence_concepts").select("id,concept_type,canonical_label")
      .eq("owner_id", ownerId).in("status", ["active", "candidate"])
      .ilike("canonical_label", pattern).limit(12),
    admin.from("intelligence_concept_aliases")
      .select("alias,concept_id,intelligence_concepts(id,concept_type,canonical_label)")
      .eq("owner_id", ownerId).ilike("alias", pattern).limit(12),
    admin.from("intelligence_entities").select("id,entity_type,canonical_name")
      .eq("owner_id", ownerId).eq("status", "active").ilike("canonical_name", pattern).limit(12),
    admin.from("intelligence_term_observations").select("normalized_term,display_term")
      .eq("owner_id", ownerId).ilike("display_term", pattern).limit(20),
    admin.from("intelligence_procurement_cases")
      .select("id,case_key,title,intelligence_procurement_case_events(event_id,transition_at)")
      .eq("owner_id", ownerId).or(`title.ilike.${pattern},case_key.ilike.${pattern}`).limit(12),
  ]);
  const error = [concepts.error, aliases.error, entities.error, terms.error, procurements.error]
    .find(Boolean);
  if (error && !["42P01", "PGRST205"].includes(String(error.code))) throw new Error(error.message);
  const matches = new Map<string, IntelligenceCatalogMatch>();
  for (const row of concepts.data ?? []) {
    const kind = row.concept_type === "capability" ? "system" : row.concept_type === "keyword" ? "keyword" : "topic";
    matches.set(`${kind}:${row.id}`, {
      id: `${kind}:${row.id}`, kind, label: String(row.canonical_label),
      whyMatched: "The signal name contains your search terms.",
    });
  }
  for (const row of aliases.data ?? []) {
    const concept = (Array.isArray(row.intelligence_concepts) ? row.intelligence_concepts[0] : row.intelligence_concepts) as
      { id?: string; concept_type?: string; canonical_label?: string } | null;
    if (!concept?.id) continue;
    const kind = concept.concept_type === "capability" ? "system" : concept.concept_type === "keyword" ? "keyword" : "topic";
    matches.set(`${kind}:${concept.id}`, {
      id: `${kind}:${concept.id}`, kind, label: String(concept.canonical_label),
      whyMatched: `Matched the alias “${row.alias}”.`,
    });
  }
  for (const row of entities.data ?? []) {
    const kind = catalogKind(String(row.entity_type));
    if (!kind) continue;
    matches.set(`${kind}:${row.id}`, {
      id: `${kind}:${row.id}`, kind, label: String(row.canonical_name),
      whyMatched: "The organization, programme, or system name contains your search terms.",
    });
  }
  for (const row of terms.data ?? []) {
    const id = `keyword:${row.normalized_term}`;
    matches.set(id, {
      id, kind: "keyword", label: String(row.display_term),
      whyMatched: "This exact keyword or phrase appears in retained coverage.",
    });
  }
  for (const row of procurements.data ?? []) {
    const profileHref = procurementEventProfileHref(row.intelligence_procurement_case_events);
    if (!profileHref) continue;
    matches.set(`buying_opportunity:${row.id}`, {
      id: `buying_opportunity:${row.id}`,
      kind: "buying_opportunity",
      label: String(row.title),
      whyMatched: `Matched buying opportunity ${row.case_key}.`,
      profileHref,
    });
  }
  return [...matches.values()].slice(0, 25);
}

export async function searchIntelligenceV2(query: string, options: { limit?: number } = {}) {
  const normalizedQuery = compactQuery(query);
  if (!normalizedQuery) return { query: "", catalog: [], results: [] };
  const ownerId = (await requireDashboardUser()).id;
  const admin = createAdminClient();
  const limit = Math.min(50, Math.max(1, options.limit ?? 30));
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  let rows: Array<Record<string, unknown>> = [];
  if (apiKey) {
    const embedding = await createEmbedding(normalizedQuery, {
      client: new OpenAI({ apiKey }),
    });
    const hybrid = await admin.rpc("hybrid_search_intelligence_segments", {
      query_owner: ownerId,
      query_text: normalizedQuery,
      query_embedding: vectorLiteral(embedding),
      match_count: Math.min(50, limit * 3),
      full_text_weight: 1.5,
      semantic_weight: 1,
      rrf_k: 50,
      min_semantic_similarity: 0.45,
    });
    if (!hybrid.error) rows = hybrid.data ?? [];
    else if (!["42P01", "PGRST202", "42883"].includes(String(hybrid.error.code))) {
      throw new Error(hybrid.error.message);
    }
  }
  if (!rows.length) {
    const lexical = await admin.from("intelligence_document_segments")
      .select("id,document_id,title,content_text,documents!inner(title,original_url,canonical_url,publisher_name,published_at,source_identity_id,intelligence_source_identities(source_family,authority_tier))")
      .eq("owner_id", ownerId)
      .in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null)
      .textSearch("search_document", normalizedQuery, { type: "websearch", config: "english" })
      .limit(Math.min(50, limit * 3));
    if (lexical.error) throw new Error(lexical.error.message);
    rows = (lexical.data ?? []).map((row) => {
      const document = Array.isArray(row.documents) ? row.documents[0] : row.documents;
      const identity = document && (Array.isArray(document.intelligence_source_identities)
        ? document.intelligence_source_identities[0]
        : document.intelligence_source_identities);
      return {
        segment_id: row.id,
        document_id: row.document_id,
        title: row.title ?? document?.title,
        passage: String(row.content_text).slice(0, 900),
        original_url: document?.original_url,
        canonical_url: document?.canonical_url,
        publisher_name: document?.publisher_name,
        published_at: document?.published_at,
        source_family: identity?.source_family,
        authority_tier: identity?.authority_tier,
        lexical_rank: 1,
        exact_match: true,
      };
    });
  }

  const familyCounts = new Map<string, number>();
  const seenStories = new Set<string>();
  const results: IntelligenceSearchResult[] = [];
  for (const row of rows) {
    const storyId = String(row.story_cluster_id ?? `document:${row.document_id}`);
    if (seenStories.has(storyId)) continue;
    const family = String(row.source_family ?? row.publisher_name ?? `document:${row.document_id}`);
    if ((familyCounts.get(family) ?? 0) >= 2) continue;
    seenStories.add(storyId);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
    const lexical = row.lexical_rank !== null && row.lexical_rank !== undefined;
    const semantic = row.semantic_rank !== null && row.semantic_rank !== undefined;
    const exact = Boolean(row.exact_match);
    const whyMatched = exact
      ? "Exact name, acronym, identifier, or phrase found in this passage."
      : lexical && semantic
        ? "Matches both your wording and the meaning of your question."
        : lexical
          ? "Contains the words in your search."
          : "Relevant to the meaning of your question.";
    results.push({
      id: String(row.segment_id),
      documentId: String(row.document_id),
      title: String(row.title ?? "Untitled source"),
      passage: String(row.passage ?? "").slice(0, 900),
      url: String(row.canonical_url ?? row.original_url ?? "") || null,
      publisher: typeof row.publisher_name === "string" ? row.publisher_name : null,
      publishedAt: typeof row.published_at === "string" ? row.published_at : null,
      sourceFamily: typeof row.source_family === "string" ? row.source_family : null,
      authority: typeof row.authority_tier === "string" ? row.authority_tier : null,
      storyId,
      whyMatched,
    });
    if (results.length >= limit) break;
  }
  return {
    query: normalizedQuery,
    catalog: await catalogMatches(admin, ownerId, normalizedQuery),
    results,
  };
}

export async function refreshSegmentEmbeddingsBatch(
  admin: SupabaseClient,
  ownerId: string,
  options: { cursor?: number; limit?: number; concurrency?: number; segmentIds?: string[] } = {},
) {
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0));
  const explicitSegmentIds = options.segmentIds === undefined
    ? null
    : [...new Set(options.segmentIds.map(String).filter(Boolean))].slice(0, 625);
  const limit = explicitSegmentIds
    ? Math.max(1, explicitSegmentIds.length)
    : Math.min(25, Math.max(1, Math.floor(options.limit ?? 10)));
  // Segment text can be large and createEmbeddings may expand one segment into
  // multiple chunks. Keep request groups conservative until batching is token-aware.
  const concurrency = Math.min(5, Math.max(1, Math.floor(options.concurrency ?? 5)));
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for segment embedding backfill.");
  if (explicitSegmentIds?.length === 0) {
    return {
      phase: "embeddings" as const,
      cursor,
      processed: 0,
      embedded: 0,
      skipped: 0,
      hasMore: false,
      nextCursor: null,
    };
  }
  let query = admin.from("intelligence_document_segments")
    .select("id,document_id,content_text,content_hash")
    .eq("owner_id", ownerId).in("segment_type", ["editorial", "unknown"])
    .is("exclusion_reason", null);
  query = explicitSegmentIds
    ? query.in("id", explicitSegmentIds).order("id", { ascending: true })
    : query.order("id", { ascending: true }).range(cursor, cursor + limit - 1);
  const segments = await query;
  if (segments.error) throw new Error(segments.error.message);
  const segmentIds = (segments.data ?? []).map((row) => String(row.id));
  const existing = segmentIds.length
    ? await admin.from("intelligence_segment_embeddings")
      .select("segment_id,content_hash,embedding_model")
      .eq("owner_id", ownerId).in("segment_id", segmentIds)
    : { data: [], error: null };
  if (existing.error) throw new Error(existing.error.message);
  const existingKeys = new Set((existing.data ?? []).map((row) =>
    `${row.segment_id}|${row.content_hash}|${row.embedding_model}`
  ));
  const client = new OpenAI({ apiKey });
  let embedded = 0;
  let skipped = 0;
  const pending: typeof segments.data = [];
  for (const segment of segments.data ?? []) {
    const key = `${segment.id}|${segment.content_hash}|${INTELLIGENCE_EMBEDDING_MODEL}`;
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    pending.push(segment);
  }
  const failures: string[] = [];
  for (let offset = 0; offset < pending.length; offset += concurrency) {
    const group = pending.slice(offset, offset + concurrency);
    let groupEmbeddings: number[][];
    try {
      groupEmbeddings = await createEmbeddings(
        group.map((segment) => String(segment.content_text)),
        { client },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(...group.map((segment) => `${segment.id}: ${reason}`));
      continue;
    }
    const outcomes = await Promise.allSettled(group.map(async (segment, groupIndex) => {
      const embedding = groupEmbeddings[groupIndex];
      if (!embedding?.length) throw new Error("Embedding batch did not return this segment.");
      const write = await admin.from("intelligence_segment_embeddings").upsert({
        owner_id: ownerId,
        document_id: segment.document_id,
        segment_id: segment.id,
        content_hash: segment.content_hash,
        embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
        embedding: vectorLiteral(embedding),
        updated_at: new Date().toISOString(),
      }, { onConflict: "segment_id,content_hash,embedding_model" });
      if (write.error) throw new Error(write.error.message);
      const cleanup = await admin.from("intelligence_segment_embeddings").delete()
        .eq("owner_id", ownerId).eq("segment_id", segment.id)
        .neq("content_hash", segment.content_hash);
      if (cleanup.error) throw new Error(cleanup.error.message);
      return String(segment.id);
    }));
    outcomes.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        embedded += 1;
        return;
      }
      const id = String(group[index]?.id ?? "unknown");
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      failures.push(`${id}: ${reason}`);
    });
  }
  if (failures.length) {
    // The caller keeps the current cursor. Successful rows are idempotently skipped
    // on retry, so only the named failures need work on the next attempt.
    throw new Error(`Segment embedding batch had ${failures.length} failure(s): ${failures.join("; ")}`);
  }
  const processed = segments.data?.length ?? 0;
  return {
    phase: "embeddings" as const,
    cursor,
    processed,
    embedded,
    skipped,
    hasMore: explicitSegmentIds ? false : processed === limit,
    nextCursor: explicitSegmentIds ? null : processed === limit ? cursor + processed : null,
  };
}
