import type { SupabaseClient } from "@supabase/supabase-js";
import { rebuildStoryAndEventClustersV2 } from "@/lib/intelligence/dedup-v2";
import { INTELLIGENCE_EMBEDDING_MODEL } from "@/lib/intelligence/enrichment";
import { refreshSegmentEmbeddingsBatch } from "@/lib/intelligence/hybrid-search-v2";
import {
  INTELLIGENCE_TERM_EXTRACTION_VERSION,
  refreshTermObservationsBatch,
} from "@/lib/intelligence/term-observations";
import { refreshConceptEmbeddingsBatch } from "@/lib/intelligence/topic-maintenance-v2";

const PAGE_SIZE = 1_000;
const SEGMENT_LIMIT = 625;
const CONCEPT_LIMIT = 1_000;
const SEGMENT_SCAN_LIMIT = 20_000;
const CONCEPT_SCAN_LIMIT = 5_000;

type SegmentCandidate = {
  id: string;
  content_hash: string;
  updated_at: string;
};

type ConceptCandidate = {
  id: string;
  taxonomy_version: string;
  updated_at: string;
};

type SegmentEmbeddingState = {
  segment_id: string;
  content_hash: string;
  embedding_model: string;
};

type ConceptEmbeddingState = {
  concept_id: string;
  taxonomy_version: string;
  embedding_model: string;
};

type TermProcessingState = {
  segment_id: string;
  content_hash: string;
  extraction_version: string;
  observation_count: number;
};

function oldestFirst<T extends { id: string; updated_at: string }>(values: T[]) {
  return [...values].sort((left, right) =>
    left.updated_at.localeCompare(right.updated_at) || left.id.localeCompare(right.id)
  );
}

function chunks<T>(values: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function refreshTermGroups(
  admin: SupabaseClient,
  ownerId: string,
  segmentIds: string[],
) {
  let processed = 0;
  let observationCount = 0;
  let batchCount = 0;
  for (const group of chunks(segmentIds)) {
    const result = await refreshTermObservationsBatch(admin, ownerId, { segmentIds: group });
    processed += result.processed;
    observationCount += result.observationCount;
    batchCount += 1;
  }
  return { processed, observationCount, batchCount };
}

async function refreshSegmentEmbeddingGroups(
  admin: SupabaseClient,
  ownerId: string,
  segmentIds: string[],
) {
  let processed = 0;
  let embedded = 0;
  let skipped = 0;
  let batchCount = 0;
  for (const group of chunks(segmentIds)) {
    const result = await refreshSegmentEmbeddingsBatch(admin, ownerId, {
      segmentIds: group,
      concurrency: 5,
    });
    processed += result.processed;
    embedded += result.embedded;
    skipped += result.skipped;
    batchCount += 1;
  }
  return { processed, embedded, skipped, batchCount };
}

async function refreshConceptEmbeddingGroups(
  admin: SupabaseClient,
  ownerId: string,
  conceptIds: string[],
) {
  let processed = 0;
  let embedded = 0;
  let skipped = 0;
  let batchCount = 0;
  for (const group of chunks(conceptIds)) {
    const result = await refreshConceptEmbeddingsBatch(admin, ownerId, {
      conceptIds: group,
      batchSize: 25,
    });
    processed += result.processed;
    embedded += result.embedded;
    skipped += result.skipped;
    batchCount += 1;
  }
  return { processed, embedded, skipped, batchCount };
}

async function recentSegments(
  admin: SupabaseClient,
  ownerId: string,
  since: string,
  offset: number,
) {
  const rows: SegmentCandidate[] = [];
  let total: number | null = null;
  const scanThrough = offset + SEGMENT_SCAN_LIMIT;
  for (let from = offset; from < scanThrough; from += PAGE_SIZE) {
    const result = await admin.from("intelligence_document_segments")
      .select("id,content_hash,updated_at", { count: from === offset ? "exact" : undefined })
      .eq("owner_id", ownerId)
      .in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null)
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, Math.min(from + PAGE_SIZE - 1, scanThrough - 1));
    if (result.error) throw new Error(result.error.message);
    if (from === offset) total = result.count;
    rows.push(...(result.data ?? []).map((row) => ({
      id: String(row.id),
      content_hash: String(row.content_hash),
      updated_at: String(row.updated_at),
    })));
    if ((result.data ?? []).length < PAGE_SIZE) break;
  }
  const totalRows = total ?? offset + rows.length;
  return {
    rows,
    offset,
    nextOffset: offset + rows.length,
    total: totalRows,
    truncated: totalRows > offset + rows.length,
  };
}

async function recentConcepts(
  admin: SupabaseClient,
  ownerId: string,
  since: string,
  offset: number,
) {
  const rows: ConceptCandidate[] = [];
  let total: number | null = null;
  const scanThrough = offset + CONCEPT_SCAN_LIMIT;
  for (let from = offset; from < scanThrough; from += PAGE_SIZE) {
    const result = await admin.from("intelligence_concepts")
      .select("id,taxonomy_version,updated_at", { count: from === offset ? "exact" : undefined })
      .eq("owner_id", ownerId)
      .in("status", ["active", "candidate"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, Math.min(from + PAGE_SIZE - 1, scanThrough - 1));
    if (result.error) throw new Error(result.error.message);
    if (from === offset) total = result.count;
    rows.push(...(result.data ?? []).map((row) => ({
      id: String(row.id),
      taxonomy_version: String(row.taxonomy_version),
      updated_at: String(row.updated_at),
    })));
    if ((result.data ?? []).length < PAGE_SIZE) break;
  }
  const totalRows = total ?? offset + rows.length;
  return {
    rows,
    offset,
    nextOffset: offset + rows.length,
    total: totalRows,
    truncated: totalRows > offset + rows.length,
  };
}

async function existingTermStates(
  admin: SupabaseClient,
  ownerId: string,
  segmentIds: string[],
) {
  const result: TermProcessingState[] = [];
  for (const group of chunks(segmentIds)) {
    const rows = await admin.from("intelligence_term_processing_state")
      .select("segment_id,content_hash,extraction_version,observation_count")
      .eq("owner_id", ownerId)
      .eq("extraction_version", INTELLIGENCE_TERM_EXTRACTION_VERSION)
      .in("segment_id", group);
    if (rows.error) throw new Error(rows.error.message);
    result.push(...(rows.data ?? []).map((row) => ({
      segment_id: String(row.segment_id),
      content_hash: String(row.content_hash),
      extraction_version: String(row.extraction_version),
      observation_count: Number(row.observation_count ?? 0),
    })));
  }
  return result;
}

async function existingSegmentEmbeddings(
  admin: SupabaseClient,
  ownerId: string,
  segmentIds: string[],
) {
  const result: SegmentEmbeddingState[] = [];
  for (const group of chunks(segmentIds)) {
    const rows = await admin.from("intelligence_segment_embeddings")
      .select("segment_id,content_hash,embedding_model")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .in("segment_id", group);
    if (rows.error) throw new Error(rows.error.message);
    result.push(...(rows.data ?? []).map((row) => ({
      segment_id: String(row.segment_id),
      content_hash: String(row.content_hash),
      embedding_model: String(row.embedding_model),
    })));
  }
  return result;
}

async function existingConceptEmbeddings(
  admin: SupabaseClient,
  ownerId: string,
  conceptIds: string[],
) {
  const result: ConceptEmbeddingState[] = [];
  for (const group of chunks(conceptIds)) {
    const rows = await admin.from("intelligence_concept_embeddings")
      .select("concept_id,taxonomy_version,embedding_model")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .in("concept_id", group);
    if (rows.error) throw new Error(rows.error.message);
    result.push(...(rows.data ?? []).map((row) => ({
      concept_id: String(row.concept_id),
      taxonomy_version: String(row.taxonomy_version),
      embedding_model: String(row.embedding_model),
    })));
  }
  return result;
}

export function selectPendingDailyMaintenance(input: {
  segments: SegmentCandidate[];
  termStates: TermProcessingState[];
  segmentEmbeddings: SegmentEmbeddingState[];
  concepts: ConceptCandidate[];
  conceptEmbeddings: ConceptEmbeddingState[];
}) {
  const segments = oldestFirst(input.segments);
  const concepts = oldestFirst(input.concepts);
  const termStateKeys = new Set(input.termStates.map((row) =>
    `${row.segment_id}|${row.content_hash}|${row.extraction_version}`
  ));
  const segmentEmbeddingKeys = new Set(input.segmentEmbeddings.map((row) =>
    `${row.segment_id}|${row.content_hash}|${row.embedding_model}`
  ));
  const conceptEmbeddingKeys = new Set(input.conceptEmbeddings.map((row) =>
    `${row.concept_id}|${row.taxonomy_version}|${row.embedding_model}`
  ));
  return {
    termSegmentIds: segments
      .filter((row) => !termStateKeys.has(
        `${row.id}|${row.content_hash}|${INTELLIGENCE_TERM_EXTRACTION_VERSION}`,
      ))
      .map((row) => row.id),
    embeddingSegmentIds: segments
      .filter((row) => !segmentEmbeddingKeys.has(
        `${row.id}|${row.content_hash}|${INTELLIGENCE_EMBEDDING_MODEL}`,
      ))
      .map((row) => row.id),
    conceptIds: concepts
      .filter((row) => !conceptEmbeddingKeys.has(
        `${row.id}|${row.taxonomy_version}|${INTELLIGENCE_EMBEDDING_MODEL}`,
      ))
      .map((row) => row.id),
  };
}

export function buildDailyMaintenanceContinuation(input: {
  complete: boolean;
  since: string;
  deferred: { terms: number; segmentEmbeddings: number; conceptEmbeddings: number };
  segmentScanTruncated: boolean;
  conceptScanTruncated: boolean;
  segmentOffset?: number;
  conceptOffset?: number;
}) {
  return input.complete ? null : {
    required: true as const,
    strategy: "oldest_unfinished_first" as const,
    maintenanceSince: input.since,
    action: "Rescan this same maintenance window; exact completion states skip finished inputs.",
    remaining: input.deferred,
    segmentScanTruncated: input.segmentScanTruncated,
    conceptScanTruncated: input.conceptScanTruncated,
    segmentOffset: Math.max(0, Math.floor(input.segmentOffset ?? 0)),
    conceptOffset: Math.max(0, Math.floor(input.conceptOffset ?? 0)),
  };
}

export async function runDailyIntelligenceV2Maintenance(
  admin: SupabaseClient,
  ownerId: string,
  options: { since: string; segmentOffset?: number; conceptOffset?: number },
) {
  const segmentOffset = Math.max(0, Math.floor(options.segmentOffset ?? 0));
  const conceptOffset = Math.max(0, Math.floor(options.conceptOffset ?? 0));
  const [segmentWindow, conceptWindow] = await Promise.all([
    recentSegments(admin, ownerId, options.since, segmentOffset),
    recentConcepts(admin, ownerId, options.since, conceptOffset),
  ]);
  const segmentIds = segmentWindow.rows.map((row) => row.id);
  const conceptIds = conceptWindow.rows.map((row) => row.id);
  const [termStates, segmentEmbeddingRows, conceptEmbeddingRows] = await Promise.all([
    existingTermStates(admin, ownerId, segmentIds),
    existingSegmentEmbeddings(admin, ownerId, segmentIds),
    existingConceptEmbeddings(admin, ownerId, conceptIds),
  ]);
  const pending = selectPendingDailyMaintenance({
    segments: segmentWindow.rows,
    termStates,
    segmentEmbeddings: segmentEmbeddingRows,
    concepts: conceptWindow.rows,
    conceptEmbeddings: conceptEmbeddingRows,
  });
  const selectedTermIds = pending.termSegmentIds.slice(0, SEGMENT_LIMIT);
  const selectedEmbeddingIds = pending.embeddingSegmentIds.slice(0, SEGMENT_LIMIT);
  const selectedConceptIds = pending.conceptIds.slice(0, CONCEPT_LIMIT);

  const terms = await refreshTermGroups(admin, ownerId, selectedTermIds);
  const [segmentEmbeddings, conceptEmbeddings] = await Promise.all([
    refreshSegmentEmbeddingGroups(admin, ownerId, selectedEmbeddingIds),
    refreshConceptEmbeddingGroups(admin, ownerId, selectedConceptIds),
  ]);
  const segmentPageDrained = pending.termSegmentIds.length <= SEGMENT_LIMIT &&
    pending.embeddingSegmentIds.length <= SEGMENT_LIMIT;
  const conceptPageDrained = pending.conceptIds.length <= CONCEPT_LIMIT;
  const complete = !segmentWindow.truncated && !conceptWindow.truncated &&
    segmentPageDrained && conceptPageDrained;
  const deferred = {
    terms: Math.max(0, pending.termSegmentIds.length - selectedTermIds.length),
    segmentEmbeddings: Math.max(0, pending.embeddingSegmentIds.length - selectedEmbeddingIds.length),
    conceptEmbeddings: Math.max(0, pending.conceptIds.length - selectedConceptIds.length),
  };
  const continuation = buildDailyMaintenanceContinuation({
    complete,
    since: options.since,
    deferred,
    segmentScanTruncated: segmentWindow.truncated,
    conceptScanTruncated: conceptWindow.truncated,
    segmentOffset: segmentPageDrained && segmentWindow.truncated
      ? segmentWindow.nextOffset
      : segmentWindow.offset,
    conceptOffset: conceptPageDrained && conceptWindow.truncated
      ? conceptWindow.nextOffset
      : conceptWindow.offset,
  });
  // Rebuilding v2 clusters replaces all generated story clusters. Do not start
  // that destructive, corpus-wide operation while inputs remain deferred.
  const dedupe = complete
    ? {
        status: "completed" as const,
        result: await rebuildStoryAndEventClustersV2(admin, ownerId),
      }
    : {
        status: "deferred" as const,
        reason: "Input maintenance must drain before the correctness-preserving full rebuild.",
      };

  return {
    maintenanceVersion: "daily-v2.0.0",
    since: options.since,
    complete,
    limits: {
      segmentsPerRun: SEGMENT_LIMIT,
      conceptsPerRun: CONCEPT_LIMIT,
      segmentScan: SEGMENT_SCAN_LIMIT,
      conceptScan: CONCEPT_SCAN_LIMIT,
    },
    scan: {
      segments: segmentWindow.rows.length,
      totalSegments: segmentWindow.total,
      segmentsTruncated: segmentWindow.truncated,
      segmentOffset: segmentWindow.offset,
      nextSegmentOffset: segmentWindow.nextOffset,
      concepts: conceptWindow.rows.length,
      totalConcepts: conceptWindow.total,
      conceptsTruncated: conceptWindow.truncated,
      conceptOffset: conceptWindow.offset,
      nextConceptOffset: conceptWindow.nextOffset,
    },
    pendingBefore: {
      terms: pending.termSegmentIds.length,
      segmentEmbeddings: pending.embeddingSegmentIds.length,
      conceptEmbeddings: pending.conceptIds.length,
    },
    deferred,
    continuation,
    terms,
    segmentEmbeddings,
    conceptEmbeddings,
    dedupe,
  };
}

export const DAILY_INTELLIGENCE_V2_LIMITS = {
  segmentLimit: SEGMENT_LIMIT,
  conceptLimit: CONCEPT_LIMIT,
  segmentScanLimit: SEGMENT_SCAN_LIMIT,
  conceptScanLimit: CONCEPT_SCAN_LIMIT,
} as const;
