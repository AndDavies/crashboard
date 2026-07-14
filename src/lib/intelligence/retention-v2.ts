import type { SupabaseClient } from "@supabase/supabase-js";

type DbObject = Record<string, unknown>;

export type IntelligenceV2RetentionResult = {
  available: boolean;
  hasMore: boolean;
  batchSize: number;
  cloneRowsDeleted: number;
  termRowsDeleted: number;
  segmentRowsDeleted: number;
  storyClustersDeleted: number;
  storyGenerationsDeleted: number;
  eventMembershipsDeleted: number;
  eventGenerationsDeleted: number;
  orphanEventClustersDeleted: number;
  generationRetentionAvailable: boolean;
  generationRetentionPages: number;
  generationSignalRowsDeleted: number;
  generationTotalRowsDeleted: number;
  generationCompacted: number;
  generationHasMore: boolean;
};

function nonNegativeInteger(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function parseIntelligenceV2RetentionResult(value: unknown): IntelligenceV2RetentionResult {
  const result = value && typeof value === "object" && !Array.isArray(value)
    ? value as DbObject
    : {};
  return {
    available: true,
    hasMore: result.has_more === true,
    batchSize: nonNegativeInteger(result.batch_size),
    cloneRowsDeleted: nonNegativeInteger(result.clone_rows_deleted),
    termRowsDeleted: nonNegativeInteger(result.term_rows_deleted),
    segmentRowsDeleted: nonNegativeInteger(result.segment_rows_deleted),
    storyClustersDeleted: nonNegativeInteger(result.story_clusters_deleted),
    storyGenerationsDeleted: nonNegativeInteger(result.story_generations_deleted),
    eventMembershipsDeleted: nonNegativeInteger(result.event_memberships_deleted),
    eventGenerationsDeleted: nonNegativeInteger(result.event_generations_deleted),
    orphanEventClustersDeleted: nonNegativeInteger(result.orphan_event_clusters_deleted),
    generationRetentionAvailable: false,
    generationRetentionPages: 0,
    generationSignalRowsDeleted: 0,
    generationTotalRowsDeleted: 0,
    generationCompacted: 0,
    generationHasMore: false,
  };
}

export async function runIntelligenceSignalGenerationRetention(
  admin: SupabaseClient,
  ownerId: string,
  options: { batchSize?: number; maxPages?: number } = {},
) {
  const batchSize = Math.min(
    2_500,
    Math.max(100, Math.floor(options.batchSize ?? 2_500)),
  );
  const maxPages = Math.min(25, Math.max(1, Math.floor(options.maxPages ?? 20)));
  let pages = 0;
  let signalRowsDeleted = 0;
  let totalRowsDeleted = 0;
  let compacted = 0;
  let hasMore = false;
  while (pages < maxPages) {
    const result = await admin.rpc("maintain_intelligence_signal_generation_retention", {
      query_owner: ownerId,
      query_batch_size: batchSize,
    });
    if (["PGRST202", "42883"].includes(String(result.error?.code ?? ""))) {
      return {
        available: false,
        pages,
        signalRowsDeleted,
        totalRowsDeleted,
        compacted,
        hasMore: false,
      };
    }
    if (result.error) {
      throw new Error(`Signal-generation retention failed: ${result.error.message}`);
    }
    const row = result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? result.data as DbObject
      : {};
    const deletedSignals = nonNegativeInteger(row.signal_rows_deleted);
    const deletedTotals = nonNegativeInteger(row.total_rows_deleted);
    signalRowsDeleted += deletedSignals;
    totalRowsDeleted += deletedTotals;
    compacted += row.compacted === true ? 1 : 0;
    hasMore = row.has_more === true;
    pages += 1;
    if (!hasMore) break;
    if (deletedSignals === 0 && deletedTotals === 0) {
      throw new Error("Signal-generation retention did not advance.");
    }
  }
  return {
    available: true,
    pages,
    signalRowsDeleted,
    totalRowsDeleted,
    compacted,
    hasMore,
  };
}

export async function runIntelligenceV2Retention(
  admin: SupabaseClient,
  ownerId: string,
  batchSize = 2_500,
): Promise<IntelligenceV2RetentionResult> {
  const result = await admin.rpc("maintain_intelligence_v2_retention", {
    query_owner: ownerId,
    query_batch_size: Math.min(2_500, Math.max(100, Math.floor(batchSize))),
  });
  if (["PGRST202", "42883"].includes(String(result.error?.code ?? ""))) {
    return {
      available: false,
      hasMore: false,
      batchSize: 0,
      cloneRowsDeleted: 0,
      termRowsDeleted: 0,
      segmentRowsDeleted: 0,
      storyClustersDeleted: 0,
      storyGenerationsDeleted: 0,
      eventMembershipsDeleted: 0,
      eventGenerationsDeleted: 0,
      orphanEventClustersDeleted: 0,
      generationRetentionAvailable: false,
      generationRetentionPages: 0,
      generationSignalRowsDeleted: 0,
      generationTotalRowsDeleted: 0,
      generationCompacted: 0,
      generationHasMore: false,
    };
  }
  if (result.error) throw new Error(`Intelligence v2 retention failed: ${result.error.message}`);
  const base = parseIntelligenceV2RetentionResult(result.data);
  const generations = await runIntelligenceSignalGenerationRetention(admin, ownerId);
  return {
    ...base,
    hasMore: base.hasMore || generations.hasMore,
    generationRetentionAvailable: generations.available,
    generationRetentionPages: generations.pages,
    generationSignalRowsDeleted: generations.signalRowsDeleted,
    generationTotalRowsDeleted: generations.totalRowsDeleted,
    generationCompacted: generations.compacted,
    generationHasMore: generations.hasMore,
  };
}
