import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_TERM_SIGNAL_BATCH_SIZE = 1_000;
export const MAX_TERM_SIGNAL_OBSERVATIONS_PER_BATCH = 2_000;
// Production PostgREST enforces an eight-second statement timeout. A 500-item
// page measured 5.4-6.4 seconds on the current archive, so keep a material
// safety margin for concurrent load and corpus growth.
export const TERM_SIGNAL_SUPPORT_BATCH_SIZE = 250;
// At the current archive size, a 5,000-observation upsert can exceed the
// production statement timeout once the support index contains 200k+ phrases.
// Two thousand preserves useful batching while leaving measured headroom.
export const TERM_SIGNAL_SUPPORT_OBSERVATION_BUDGET = 2_000;
export const TERM_SIGNAL_FINALIZE_CURSOR_BASE = 500_000;
export const TERM_SIGNAL_TERM_CURSOR_BASE = 1_000_000;
export const TERM_SIGNAL_CLEANUP_CURSOR_BASE = 1_000_000_000;
const TERM_SIGNAL_CLEANUP_PAGE_WIDTH = 10_000;

type DbRow = Record<string, unknown>;

export type TermSignalObservationRow = {
  segment_id: string;
  document_id: string;
  normalized_term: string;
  display_term: string;
  occurrence_count: number;
  salience: number;
};

type TermSupportRow = {
  ordinal: number;
  observationCount: number;
};

export type TermSignalSupportCloneProgress = {
  sourceRefreshId: string;
  targetRefreshId: string;
  extractionVersion: string;
  startDate: string;
  endDate: string;
  phase: "segments" | "terms" | "complete";
  complete: boolean;
  copiedSegmentCount: number;
  sourceSegmentCount: number;
  copiedTermCount: number;
  sourceTermCount: number;
  sourceFinalOrdinal: number;
  copiedSegmentInBatch: number;
  copiedTermInBatch: number;
};

export function selectBoundedTermSupportRows(
  rows: TermSupportRow[],
  maximumObservations = MAX_TERM_SIGNAL_OBSERVATIONS_PER_BATCH,
) {
  const maximum = Math.max(1, Math.floor(maximumObservations));
  const selected: TermSupportRow[] = [];
  let observationCount = 0;
  for (const row of rows) {
    const nextCount = observationCount + Math.max(0, row.observationCount);
    if (selected.length && nextCount > maximum) break;
    selected.push(row);
    observationCount = nextCount;
  }
  return { rows: selected, observationCount };
}

function numeric(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function requiredString(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`term signal support clone returned no ${label}`);
  return result;
}

export async function cloneFinalizedTermSignalSupportBatch(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    sourceRefreshId: string;
    targetRefreshId: string;
    extractionVersion: string;
    startDate: string;
    endDate: string;
    batchSize?: number;
  },
): Promise<TermSignalSupportCloneProgress> {
  if (input.sourceRefreshId === input.targetRefreshId) {
    throw new Error("Term signal support source and target refreshes must differ.");
  }
  const requestedBatchSize = Number(input.batchSize ?? 1_000);
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.min(2_000, Math.max(100, Math.floor(requestedBatchSize)))
    : 1_000;
  const result = await admin.rpc(
    "clone_intelligence_term_signal_support_snapshot",
    {
      query_owner: input.ownerId,
      query_source_refresh_id: input.sourceRefreshId,
      query_target_refresh_id: input.targetRefreshId,
      query_extraction_version: input.extractionVersion,
      query_start: input.startDate,
      query_end: input.endDate,
      query_batch_size: batchSize,
    },
  );
  if (result.error) {
    throw new Error(`term signal support clone failed: ${result.error.message}`);
  }
  const summary = result.data && typeof result.data === "object" &&
      !Array.isArray(result.data)
    ? result.data as DbRow
    : {};
  const phase = String(summary.phase ?? "");
  if (!["segments", "terms", "complete"].includes(phase)) {
    throw new Error("term signal support clone returned an invalid phase");
  }
  const progress: TermSignalSupportCloneProgress = {
    sourceRefreshId: requiredString(summary.source_refresh_id, "source refresh"),
    targetRefreshId: requiredString(summary.target_refresh_id, "target refresh"),
    extractionVersion: requiredString(
      summary.extraction_version,
      "extraction version",
    ),
    startDate: requiredString(summary.start_date, "start date"),
    endDate: requiredString(summary.end_date, "end date"),
    phase: phase as TermSignalSupportCloneProgress["phase"],
    complete: summary.complete === true,
    copiedSegmentCount: Math.max(
      0,
      Math.floor(numeric(summary.copied_segment_count)),
    ),
    sourceSegmentCount: Math.max(
      0,
      Math.floor(numeric(summary.source_segment_count)),
    ),
    copiedTermCount: Math.max(
      0,
      Math.floor(numeric(summary.copied_term_count)),
    ),
    sourceTermCount: Math.max(
      0,
      Math.floor(numeric(summary.source_term_count)),
    ),
    sourceFinalOrdinal: Math.max(
      0,
      Math.floor(numeric(summary.source_final_ordinal)),
    ),
    copiedSegmentInBatch: Math.max(
      0,
      Math.floor(numeric(summary.copied_segment_in_batch)),
    ),
    copiedTermInBatch: Math.max(
      0,
      Math.floor(numeric(summary.copied_term_in_batch)),
    ),
  };
  if (
    progress.sourceRefreshId !== input.sourceRefreshId ||
    progress.targetRefreshId !== input.targetRefreshId ||
    progress.extractionVersion !== input.extractionVersion ||
    progress.startDate !== input.startDate ||
    progress.endDate !== input.endDate ||
    progress.copiedSegmentCount > progress.sourceSegmentCount ||
    progress.copiedTermCount > progress.sourceTermCount ||
    progress.sourceFinalOrdinal !== progress.sourceTermCount ||
    progress.complete !== (progress.phase === "complete")
  ) {
    throw new Error("term signal support clone returned a mismatched contract");
  }
  return progress;
}

export function encodeTermSignalCleanupCursor(finalOrdinal: number, page: number) {
  const ordinal = Math.max(0, Math.floor(finalOrdinal));
  const normalizedPage = Math.max(0, Math.floor(page));
  if (normalizedPage >= TERM_SIGNAL_CLEANUP_PAGE_WIDTH) {
    throw new Error("Term signal cleanup exceeded its resumable page range.");
  }
  return TERM_SIGNAL_CLEANUP_CURSOR_BASE +
    ordinal * TERM_SIGNAL_CLEANUP_PAGE_WIDTH + normalizedPage;
}

export function decodeTermSignalCleanupCursor(cursor: number) {
  const payload = Math.max(0, Math.floor(cursor)) - TERM_SIGNAL_CLEANUP_CURSOR_BASE;
  if (payload < 0) throw new Error("Term signal cleanup cursor is invalid.");
  return {
    finalOrdinal: Math.floor(payload / TERM_SIGNAL_CLEANUP_PAGE_WIDTH),
    page: payload % TERM_SIGNAL_CLEANUP_PAGE_WIDTH,
  };
}

export async function accumulateTermSignalSupport(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    extractionVersion: string;
    startDate: string;
    endDate: string;
    segmentIds: string[];
    reset: boolean;
    batchSize?: number;
  },
) {
  const result = await admin.rpc("accumulate_intelligence_term_signal_refresh_v2", {
    query_owner: input.ownerId,
    query_refresh_id: input.refreshId,
    query_extraction_version: input.extractionVersion,
    query_start: input.startDate,
    query_end: input.endDate,
    query_segment_ids: input.segmentIds,
    query_batch_size: Math.min(
      1_000,
      Math.max(1, Math.floor(input.batchSize ?? TERM_SIGNAL_SUPPORT_BATCH_SIZE)),
    ),
    query_observation_budget: TERM_SIGNAL_SUPPORT_OBSERVATION_BUDGET,
    query_reset: input.reset,
  });
  if (result.error) {
    throw new Error(`term signal support accumulation failed: ${result.error.message}`);
  }
  const summary = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as DbRow
    : {};
  return {
    processedSegmentCount: Math.max(
      0,
      Math.floor(numeric(summary.processed_segment_count)),
    ),
    processedObservationCount: Math.max(
      0,
      Math.floor(numeric(summary.processed_observation_count)),
    ),
    remainingSegmentCount: Math.max(
      0,
      Math.floor(numeric(summary.remaining_segment_count)),
    ),
    totalSegmentCount: Math.max(
      0,
      Math.floor(numeric(summary.total_segment_count)),
    ),
  };
}

export async function finalizeTermSignalSupport(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    extractionVersion: string;
    startDate: string;
    endDate: string;
  },
) {
  const result = await admin.rpc("finalize_intelligence_term_signal_support_v2", {
    query_owner: input.ownerId,
    query_refresh_id: input.refreshId,
    query_extraction_version: input.extractionVersion,
    query_start: input.startDate,
    query_end: input.endDate,
    query_batch_size: 2_000,
  });
  if (result.error) {
    throw new Error(`term signal support finalization failed: ${result.error.message}`);
  }
  const summary = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as DbRow
    : {};
  const stage = String(summary.stage ?? "");
  if (stage !== "prune" && stage !== "ordinal" && stage !== "complete") {
    throw new Error("term signal support finalization returned an invalid stage");
  }
  return {
    candidateTermCount: Math.max(
      0,
      Math.floor(numeric(summary.candidate_term_count)),
    ),
    hasMore: Boolean(summary.has_more),
    processedCount: Math.max(0, Math.floor(numeric(summary.processed_count))),
    stage,
  };
}

export async function fetchTermSignalBatch(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    extractionVersion: string;
    startDate: string;
    endDate: string;
    cursor: number;
    termLimit?: number;
    maximumObservations?: number;
  },
) {
  const cursor = Math.max(0, Math.floor(input.cursor));
  const termLimit = Math.min(
    1_000,
    Math.max(1, Math.floor(input.termLimit ?? DEFAULT_TERM_SIGNAL_BATCH_SIZE)),
  );
  const support = await admin
    .from("intelligence_term_signal_refresh_terms")
    .select("ordinal,observation_count", { count: "exact" })
    .eq("owner_id", input.ownerId)
    .eq("refresh_id", input.refreshId)
    .eq("extraction_version", input.extractionVersion)
    .eq("start_date", input.startDate)
    .eq("end_date", input.endDate)
    .gt("ordinal", cursor)
    .order("ordinal", { ascending: true })
    .limit(termLimit);
  if (support.error) {
    throw new Error(`term signal support page failed after ${cursor}: ${support.error.message}`);
  }

  const candidates: TermSupportRow[] = (support.data ?? []).map((row: DbRow) => ({
    ordinal: Math.max(0, Math.floor(numeric(row.ordinal))),
    observationCount: Math.max(0, Math.floor(numeric(row.observation_count))),
  }));
  const bounded = selectBoundedTermSupportRows(
    candidates,
    input.maximumObservations,
  );
  const nextCursor = bounded.rows.at(-1)?.ordinal ?? cursor;
  const remainingCandidateCount = Math.max(0, support.count ?? candidates.length);
  if (!bounded.rows.length) {
    if (cursor > 0) {
      const snapshot = await admin
        .from("intelligence_term_signal_refresh_terms")
        .select("ordinal", { count: "exact", head: true })
        .eq("owner_id", input.ownerId)
        .eq("refresh_id", input.refreshId)
        .eq("extraction_version", input.extractionVersion)
        .eq("start_date", input.startDate)
        .eq("end_date", input.endDate);
      if (snapshot.error) {
        throw new Error(`term signal support verification failed: ${snapshot.error.message}`);
      }
      if (!snapshot.count) {
        throw new Error(
          "Term signal support snapshot is missing; restart this signal refresh from cursor 0.",
        );
      }
    }
    return {
      rows: [] as TermSignalObservationRow[],
      candidateCount: 0,
      observationCount: 0,
      hasMore: false,
      nextCursor: null,
    };
  }

  const observationRows: DbRow[] = [];
  let observationOffset = 0;
  while (true) {
    const observations = await admin.rpc("get_intelligence_term_signal_observations", {
      query_owner: input.ownerId,
      query_refresh_id: input.refreshId,
      query_extraction_version: input.extractionVersion,
      query_start: input.startDate,
      query_end: input.endDate,
      query_after_ordinal: cursor,
      query_through_ordinal: nextCursor,
      query_offset: observationOffset,
      query_limit: MAX_TERM_SIGNAL_OBSERVATIONS_PER_BATCH,
    });
    if (observations.error) {
      throw new Error(
        `term signal observation page ${cursor + 1}-${nextCursor} failed: ${observations.error.message}`,
      );
    }
    const payload = observations.data && typeof observations.data === "object" &&
        !Array.isArray(observations.data)
      ? observations.data as DbRow
      : {};
    const pageRows = Array.isArray(payload.rows) ? payload.rows as DbRow[] : null;
    if (!pageRows || pageRows.length > MAX_TERM_SIGNAL_OBSERVATIONS_PER_BATCH) {
      throw new Error(
        `term signal observation page ${cursor + 1}-${nextCursor} returned an invalid result`,
      );
    }
    observationRows.push(...pageRows);
    if (payload.has_more !== true) break;
    const nextOffset = Math.floor(numeric(payload.next_offset));
    if (nextOffset <= observationOffset) {
      throw new Error(
        `term signal observation page ${cursor + 1}-${nextCursor} did not advance`,
      );
    }
    observationOffset = nextOffset;
  }

  return {
    rows: observationRows.map((row) => ({
      segment_id: String(row.segment_id),
      document_id: String(row.document_id),
      normalized_term: String(row.normalized_term),
      display_term: String(row.display_term),
      occurrence_count: Math.max(0, numeric(row.occurrence_count)),
      salience: Math.max(0, Math.min(1, numeric(row.salience))),
    })),
    candidateCount: bounded.rows.length,
    observationCount: bounded.observationCount,
    hasMore: remainingCandidateCount > bounded.rows.length,
    nextCursor,
  };
}

export async function completeTermSignalRefresh(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    generationStartedAt: string;
    metricVersion: string;
    startDate: string;
    endDate: string;
    finalOrdinal: number;
    batchSize?: number;
  },
) {
  const result = await admin.rpc("complete_intelligence_term_signal_refresh", {
    query_owner: input.ownerId,
    query_refresh_id: input.refreshId,
    query_generation_started_at: input.generationStartedAt,
    query_metric_version: input.metricVersion,
    query_start: input.startDate,
    query_end: input.endDate,
    query_final_ordinal: input.finalOrdinal,
    // Stale daily rows are wide and the production API applies a short
    // statement timeout. Cleanup is resumable, so favour small, reliable
    // deletes over a single large transaction.
    query_batch_size: Math.min(2_000, Math.max(100, Math.floor(input.batchSize ?? 250))),
  });
  if (result.error) {
    throw new Error(`term signal refresh completion failed: ${result.error.message}`);
  }
  const summary = result.data && typeof result.data === "object" && !Array.isArray(result.data)
    ? result.data as DbRow
    : {};
  return {
    removedCount: Math.max(0, Math.floor(numeric(summary.removed_count))),
    hasMore: summary.has_more === true,
  };
}
