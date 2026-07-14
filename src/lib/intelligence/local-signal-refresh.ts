import { createHash } from "node:crypto";
import {
  parseIntelligenceEvaluationSignalSnapshot,
  type IntelligenceEvaluationSignalSnapshot,
} from "@/lib/intelligence/signal-generations-v2";

export const LOCAL_SIGNAL_REFRESH_JOB = "intelligence_v2_local_signal_refresh";
export const DEFAULT_POST_BACKFILL_REFRESH_TARGET = 6;
export const LOCAL_SIGNAL_REFRESH_LEASE_MS = 6 * 60 * 1_000;
export const LOCAL_SIGNAL_REFRESH_MODE_CLONED = "cloned_backfill_window";
export const LOCAL_SIGNAL_REFRESH_MODE_CURRENT = "current_window";

export type LocalSignalRefreshMode =
  | typeof LOCAL_SIGNAL_REFRESH_MODE_CLONED
  | typeof LOCAL_SIGNAL_REFRESH_MODE_CURRENT;

export type LocalSignalRefreshPlan =
  | {
    kind: "cloned_validation";
    sequence: number;
  }
  | {
    kind: "current_window";
    completeThrough: string;
    sequence: number;
  }
  | {
    kind: "complete";
    reason:
      | "current_window_already_complete"
      | "current_window_not_newer"
      | "target_reached";
  };

export type LocalSignalRefreshBatchInput = {
  completeThrough?: string;
  eventDedupGenerationId?: string | null;
  existingFinalizedTermSupport?: boolean;
  historyDays: number;
  promoteGeneration?: boolean;
  refreshId: string;
  refreshStartedAt: string;
  sharedValidationContextSourceId?: string;
  storyDedupGenerationId?: string | null;
  termCursor: number;
};

export type LocalSignalRefreshBatchResult = {
  completeThrough: string;
  startDate: string;
  observationCount: number;
  processedCandidateTermCount: number;
  signalCount: number;
  dailyRowCount: number;
  removedStaleRows: number;
  hasMore: boolean;
  nextCursor: number | null;
  metricVersion: string;
  signalStage: "support" | "terms" | "cleanup";
  eventDedupGenerationId?: string | null;
  storyDedupGenerationId?: string | null;
};

export type LocalSignalRefreshState = {
  cursor: number;
  completeThrough?: string;
  historyDays: number;
  pageCount: number;
  observationCount: number;
  processedCandidateTermCount: number;
  removedStaleRows: number;
  eventDedupGenerationId?: string | null;
  storyDedupGenerationId?: string | null;
};

export type LocalSignalRefreshProgress = Omit<
  LocalSignalRefreshState,
  "completeThrough"
> & {
  completeThrough: string;
  required: boolean;
  startDate: string;
  signalCount: number;
  dailyRowCount: number;
  metricVersion: string;
  signalStage: LocalSignalRefreshBatchResult["signalStage"];
};

type JsonObject = Record<string, unknown>;

export type LocalEvaluationSignalSnapshot = IntelligenceEvaluationSignalSnapshot & {
  refreshId: string;
  startDate: string;
  completeThrough: string;
  metricVersion: string;
};

export type LocalValidationGenerationPruneProgress = {
  pages: number;
  signalRowsDeleted: number;
  totalRowsDeleted: number;
  generationDeleted: boolean;
  alreadyPruned: boolean;
  complete: boolean;
};

export type CompletedBackfillTermSupportSnapshot = {
  sourceRefreshId: string;
  extractionVersion: string;
  startDate: string;
  endDate: string;
  historyDays: number;
};

export function localValidationStateMatchesSupportSnapshot(
  state: Pick<LocalSignalRefreshState, "completeThrough" | "historyDays">,
  snapshot: CompletedBackfillTermSupportSnapshot,
) {
  return (!state.completeThrough || state.completeThrough === snapshot.endDate) &&
    state.historyDays === snapshot.historyDays;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

export function localSignalScoringIsComplete(checkpointValue: unknown) {
  const checkpoint = object(checkpointValue);
  return ["v2_complete", "validation_snapshot", "validation_pruning"].includes(
    String(checkpoint.phase ?? ""),
  ) && object(checkpoint.signal_continuation).required === false;
}

export function localEvaluationSignalSnapshotFromCheckpoint(
  checkpointValue: unknown,
  input: {
    refreshId: string;
    startDate: string;
    completeThrough: string;
    metricVersion: string;
  },
): LocalEvaluationSignalSnapshot | null {
  const raw = object(object(checkpointValue).evaluation_signal_snapshot);
  const snapshot = parseIntelligenceEvaluationSignalSnapshot(raw);
  if (
    !snapshot ||
    raw.refreshId !== input.refreshId ||
    raw.startDate !== input.startDate ||
    raw.completeThrough !== input.completeThrough ||
    raw.metricVersion !== input.metricVersion
  ) return null;
  return { ...snapshot, ...input };
}

export async function runBoundedLocalValidationGenerationPrune(input: {
  state?: Partial<LocalValidationGenerationPruneProgress>;
  pruneBatch: () => Promise<{
    signalRowsDeleted: number;
    totalRowsDeleted: number;
    generationDeleted: boolean;
    alreadyPruned: boolean;
    hasMore: boolean;
  }>;
  checkpoint: (progress: LocalValidationGenerationPruneProgress) => Promise<void>;
  maxPages?: number;
}) {
  let progress: LocalValidationGenerationPruneProgress = {
    pages: Math.max(0, Math.floor(input.state?.pages ?? 0)),
    signalRowsDeleted: Math.max(0, Math.floor(input.state?.signalRowsDeleted ?? 0)),
    totalRowsDeleted: Math.max(0, Math.floor(input.state?.totalRowsDeleted ?? 0)),
    generationDeleted: input.state?.generationDeleted === true,
    alreadyPruned: input.state?.alreadyPruned === true,
    complete: input.state?.complete === true,
  };
  const maxPages = Math.min(2_000, Math.max(1, Math.floor(input.maxPages ?? 500)));
  while (!progress.complete) {
    if (progress.pages >= maxPages) {
      throw new Error(`Validation generation pruning exceeded ${maxPages} bounded pages.`);
    }
    const page = await input.pruneBatch();
    if (page.hasMore && page.signalRowsDeleted === 0 && page.totalRowsDeleted === 0) {
      throw new Error("Validation generation pruning did not advance.");
    }
    progress = {
      pages: progress.pages + 1,
      signalRowsDeleted: progress.signalRowsDeleted + page.signalRowsDeleted,
      totalRowsDeleted: progress.totalRowsDeleted + page.totalRowsDeleted,
      generationDeleted: page.generationDeleted,
      alreadyPruned: page.alreadyPruned,
      complete: !page.hasMore,
    };
    await input.checkpoint(progress);
  }
  return progress;
}

function boundedInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function validDateKey(value: unknown) {
  const candidate = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : undefined;
}

function savedGenerationId(
  container: JsonObject,
  key: "eventDedupGenerationId" | "storyDedupGenerationId",
) {
  if (!Object.prototype.hasOwnProperty.call(container, key)) {
    return { present: false, value: undefined } as const;
  }
  const value = container[key];
  if (value === null) return { present: true, value: null } as const;
  const normalized = String(value ?? "").trim();
  return { present: true, value: normalized || null } as const;
}

function consistentNonEmpty(values: unknown[]) {
  const normalized = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  return unique.length === 1 ? unique[0] : undefined;
}

export function completedBackfillTermSupportSnapshot(
  runValue: unknown,
  input: {
    metricVersion: string;
    extractionVersion: string;
  },
): CompletedBackfillTermSupportSnapshot | null {
  const run = object(runValue);
  const checkpoint = object(run.checkpoint_after);
  const continuation = object(checkpoint.signal_continuation);
  const signals = object(checkpoint.signals);
  const result = object(checkpoint.result);
  const resultSignals = object(result.signals);
  if (
    run.status !== "completed" ||
    checkpoint.job !== "intelligence_v2" ||
    checkpoint.phase !== "complete" ||
    continuation.required !== false
  ) return null;

  const metricVersion = consistentNonEmpty([
    checkpoint.metric_version,
    checkpoint.metricVersion,
    signals.metricVersion,
    result.metricVersion,
    resultSignals.metricVersion,
  ]);
  const sourceRefreshId = consistentNonEmpty([
    checkpoint.signal_refresh_id,
    continuation.refreshId,
    signals.refreshId,
    resultSignals.refreshId,
  ]);
  const startDate = consistentNonEmpty([
    continuation.startDate,
    signals.startDate,
    resultSignals.startDate,
  ]);
  const endDate = consistentNonEmpty([
    checkpoint.signal_complete_through,
    continuation.completeThrough,
    signals.completeThrough,
    resultSignals.completeThrough,
  ]);
  if (
    metricVersion !== input.metricVersion ||
    !sourceRefreshId ||
    !validDateKey(startDate) ||
    !validDateKey(endDate) ||
    startDate! > endDate!
  ) return null;
  const historyDays = Math.round(
    (Date.parse(`${endDate}T12:00:00.000Z`) -
      Date.parse(`${startDate}T12:00:00.000Z`)) /
      86_400_000,
  ) + 1;
  if (historyDays < 112 || historyDays > 730) return null;
  return {
    sourceRefreshId,
    extractionVersion: input.extractionVersion,
    startDate: startDate!,
    endDate: endDate!,
    historyDays,
  };
}

export function localSignalRefreshStateFromCheckpoint(
  checkpointValue: unknown,
  input: {
    runId: string;
    startedAt: string;
    historyDays?: number;
  },
): LocalSignalRefreshState | null {
  const checkpoint = object(checkpointValue);
  if (checkpoint.job !== LOCAL_SIGNAL_REFRESH_JOB) return null;
  const continuation = object(checkpoint.signal_continuation);
  if (
    continuation.strategy !== "term_signal_v2" ||
    String(continuation.refreshId ?? input.runId) !== input.runId ||
    !Number.isFinite(Date.parse(String(continuation.refreshStartedAt ?? input.startedAt)))
  ) {
    return null;
  }
  const historyDays = Math.min(
    730,
    Math.max(112, boundedInteger(continuation.historyDays, input.historyDays ?? 395)),
  );
  const cursor = boundedInteger(continuation.cursor);
  const completeThrough = validDateKey(continuation.completeThrough);
  const eventGeneration = savedGenerationId(
    continuation,
    "eventDedupGenerationId",
  );
  const storyGeneration = savedGenerationId(
    continuation,
    "storyDedupGenerationId",
  );
  // Cursor zero can safely create a fresh eligible-item snapshot. Every later
  // page must retain the exact date window that produced that snapshot.
  if (cursor > 0 && !completeThrough) return null;
  return {
    cursor,
    completeThrough,
    historyDays,
    pageCount: boundedInteger(checkpoint.signal_page_count),
    observationCount: boundedInteger(checkpoint.observation_count),
    processedCandidateTermCount: boundedInteger(
      checkpoint.processed_candidate_term_count,
    ),
    removedStaleRows: boundedInteger(checkpoint.removed_stale_rows),
    ...(eventGeneration.present
      ? { eventDedupGenerationId: eventGeneration.value }
      : {}),
    ...(storyGeneration.present
      ? { storyDedupGenerationId: storyGeneration.value }
      : {}),
  };
}

export function remainingPostBackfillRefreshes(input: {
  target: number;
  completedMetricVersions: unknown[];
  metricVersion: string;
}) {
  const target = Math.min(20, Math.max(1, Math.floor(input.target)));
  const completed = input.completedMetricVersions.filter(
    (version) => version === input.metricVersion,
  ).length;
  return Math.max(0, target - completed);
}

export function planLocalSignalRefresh(input: {
  target: number;
  completedClonedRefreshes: number;
  requireCurrentWindow: boolean;
  currentWindowCompleted: boolean;
  latestCompleteThrough: string;
  supportEndDate: string;
}): LocalSignalRefreshPlan {
  const target = Math.min(20, Math.max(1, Math.floor(input.target)));
  const completedClonedRefreshes = Math.max(
    0,
    Math.floor(input.completedClonedRefreshes),
  );
  if (completedClonedRefreshes < target) {
    return {
      kind: "cloned_validation",
      sequence: completedClonedRefreshes + 1,
    };
  }
  if (!input.requireCurrentWindow) {
    return { kind: "complete", reason: "target_reached" };
  }
  const latestCompleteThrough = validDateKey(input.latestCompleteThrough);
  const supportEndDate = validDateKey(input.supportEndDate);
  if (!latestCompleteThrough || !supportEndDate) {
    throw new Error("Local signal refresh plan contains an invalid date window.");
  }
  if (latestCompleteThrough <= supportEndDate) {
    return { kind: "complete", reason: "current_window_not_newer" };
  }
  if (input.currentWindowCompleted) {
    return { kind: "complete", reason: "current_window_already_complete" };
  }
  return {
    kind: "current_window",
    completeThrough: latestCompleteThrough,
    sequence: target + 1,
  };
}

export function shouldReleaseClonedValidationContext(
  plan: LocalSignalRefreshPlan,
) {
  return plan.kind !== "cloned_validation";
}

export function qualifiesCompletedPostBackfillRefresh(
  runValue: unknown,
  input: {
    backfillId: string;
    backfillCompletedAt: string;
    metricVersion: string;
  },
) {
  const run = object(runValue);
  const checkpoint = object(run.checkpoint_after);
  const completedAt = Date.parse(String(run.completed_at ?? ""));
  if (
    run.status !== "completed" ||
    !Number.isFinite(completedAt) ||
    completedAt <= Date.parse(input.backfillCompletedAt) ||
    checkpoint.metric_version !== input.metricVersion
  ) {
    return false;
  }
  for (const key of [
    "v2_signal_count",
    "v2_daily_row_count",
    "legacy_snapshot_count",
  ]) {
    const value = checkpoint[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return false;
  }
  if (checkpoint.backfill_run_id !== input.backfillId) return false;
  const completeThrough = validDateKey(checkpoint.complete_through);
  const refreshStartedAt = String(checkpoint.refresh_started_at ?? "");
  const refreshId = String(checkpoint.refresh_id ?? "");
  if (
    !completeThrough ||
    !Number.isFinite(Date.parse(refreshStartedAt)) ||
    !refreshId
  ) return false;
  if (checkpoint.job !== LOCAL_SIGNAL_REFRESH_JOB) {
    // The scheduled production route has no local job marker, but records the
    // paired legacy/v2 counts and current metric before completing the row.
    return !String(checkpoint.job ?? "");
  }
  const continuation = object(checkpoint.signal_continuation);
  return checkpoint.phase === "complete" &&
    continuation.required === false &&
    continuation.strategy === "term_signal_v2" &&
    continuation.completeThrough === completeThrough &&
    continuation.refreshStartedAt === refreshStartedAt &&
    String(continuation.refreshId ?? "") === refreshId &&
    refreshId === String(run.id ?? "");
}

export function qualifiesCompletedClonedValidationRefresh(
  runValue: unknown,
  input: {
    backfillId: string;
    backfillCompletedAt: string;
    metricVersion: string;
    supportEndDate: string;
    target: number;
  },
) {
  if (!qualifiesCompletedPostBackfillRefresh(runValue, input)) return false;
  const checkpoint = object(object(runValue).checkpoint_after);
  const mode = String(checkpoint.validation_mode ?? "");
  const sequence = Number(checkpoint.series_index);
  const target = Math.min(20, Math.max(1, Math.floor(input.target)));
  const snapshot = object(checkpoint.evaluation_signal_snapshot);
  const continuation = object(checkpoint.signal_continuation);
  const parsedSnapshot = parseIntelligenceEvaluationSignalSnapshot(snapshot);
  return checkpoint.job === LOCAL_SIGNAL_REFRESH_JOB &&
    (!mode || mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED) &&
    checkpoint.complete_through === input.supportEndDate &&
    checkpoint.validation_generation_pruned === true &&
    Boolean(parsedSnapshot) &&
    snapshot.refreshId === String(object(runValue).id ?? "") &&
    snapshot.startDate === continuation.startDate &&
    snapshot.completeThrough === input.supportEndDate &&
    snapshot.metricVersion === input.metricVersion &&
    Number.isInteger(sequence) &&
    sequence >= 1 &&
    sequence <= target;
}

export function qualifiesCompletedCurrentWindowRefresh(
  runValue: unknown,
  input: {
    backfillId: string;
    backfillCompletedAt: string;
    completeThrough: string;
    metricVersion: string;
  },
) {
  if (!qualifiesCompletedPostBackfillRefresh(runValue, input)) return false;
  const checkpoint = object(object(runValue).checkpoint_after);
  return checkpoint.job === LOCAL_SIGNAL_REFRESH_JOB &&
    checkpoint.validation_mode === LOCAL_SIGNAL_REFRESH_MODE_CURRENT &&
    checkpoint.complete_through === input.completeThrough;
}

export function localSignalRefreshModeFromCheckpoint(
  checkpointValue: unknown,
): LocalSignalRefreshMode | null {
  const checkpoint = object(checkpointValue);
  if (checkpoint.job !== LOCAL_SIGNAL_REFRESH_JOB) return null;
  if (checkpoint.validation_mode === LOCAL_SIGNAL_REFRESH_MODE_CURRENT) {
    return LOCAL_SIGNAL_REFRESH_MODE_CURRENT;
  }
  if (
    checkpoint.validation_mode === undefined ||
    checkpoint.validation_mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED
  ) {
    return LOCAL_SIGNAL_REFRESH_MODE_CLONED;
  }
  return null;
}

export function completedPostBackfillRefreshGenerationId(runValue: unknown) {
  const checkpoint = object(object(runValue).checkpoint_after);
  if (checkpoint.job === LOCAL_SIGNAL_REFRESH_JOB) {
    return String(object(checkpoint.signal_continuation).refreshId ?? "");
  }
  return String(checkpoint.refresh_id ?? "");
}

export function localSignalRefreshLeaseIsActive(
  heartbeatAt: unknown,
  now = Date.now(),
) {
  const heartbeat = Date.parse(String(heartbeatAt ?? ""));
  return Number.isFinite(heartbeat) && now - heartbeat < LOCAL_SIGNAL_REFRESH_LEASE_MS;
}

export function localSignalRefreshCanBeReclaimed(
  status: unknown,
  heartbeatAt: unknown,
  now = Date.now(),
) {
  return status === "partial" ||
    (status === "running" && !localSignalRefreshLeaseIsActive(heartbeatAt, now));
}

export function localSignalRefreshLeaseMatches(
  checkpointValue: unknown,
  leaseToken: string,
) {
  return Boolean(leaseToken) && object(checkpointValue).lease_token === leaseToken;
}

function localSignalRefreshUuid(seed: string) {
  const bytes = createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32)
    .split("");
  bytes[12] = "5";
  bytes[16] = ["8", "9", "a", "b"][Number.parseInt(bytes[16] ?? "0", 16) % 4]!;
  const hex = bytes.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function localSignalRefreshRunId(
  backfillId: string,
  sequence: number,
  metricVersion: string,
) {
  return localSignalRefreshUuid(
    `${LOCAL_SIGNAL_REFRESH_JOB}:${backfillId}:${metricVersion}:${sequence}`,
  );
}

export function localCurrentWindowRefreshRunId(
  backfillId: string,
  completeThrough: string,
  metricVersion: string,
) {
  const date = validDateKey(completeThrough);
  if (!date) throw new Error("Current-window signal refresh date is invalid.");
  return localSignalRefreshUuid(
    `${LOCAL_SIGNAL_REFRESH_JOB}:${LOCAL_SIGNAL_REFRESH_MODE_CURRENT}:${backfillId}:${metricVersion}:${date}`,
  );
}

export function legacySignalAnchorForCompleteThrough(completeThrough: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(completeThrough)) {
    throw new Error("Signal refresh complete-through date is invalid.");
  }
  const anchor = new Date(
    new Date(`${completeThrough}T12:00:00.000Z`).getTime() + 86_400_000,
  );
  if (!Number.isFinite(anchor.getTime())) {
    throw new Error("Signal refresh complete-through date is invalid.");
  }
  return anchor;
}

export async function runLocalSignalRefreshPages(input: {
  refreshId: string;
  refreshStartedAt: string;
  metricVersion: string;
  promoteGeneration?: boolean;
  useExistingFinalizedTermSupport?: boolean;
  sharedValidationContextSourceId?: string;
  state?: Partial<LocalSignalRefreshState>;
  runBatch: (
    batch: LocalSignalRefreshBatchInput,
  ) => Promise<LocalSignalRefreshBatchResult>;
  checkpoint: (
    progress: LocalSignalRefreshProgress,
    result: LocalSignalRefreshBatchResult,
  ) => Promise<void>;
}) {
  let state: LocalSignalRefreshState = {
    cursor: Math.max(0, Math.floor(input.state?.cursor ?? 0)),
    completeThrough: input.state?.completeThrough,
    historyDays: Math.min(
      730,
      Math.max(112, Math.floor(input.state?.historyDays ?? 395)),
    ),
    pageCount: Math.max(0, Math.floor(input.state?.pageCount ?? 0)),
    observationCount: Math.max(
      0,
      Math.floor(input.state?.observationCount ?? 0),
    ),
    processedCandidateTermCount: Math.max(
      0,
      Math.floor(input.state?.processedCandidateTermCount ?? 0),
    ),
    removedStaleRows: Math.max(
      0,
      Math.floor(input.state?.removedStaleRows ?? 0),
    ),
    ...(input.state && Object.prototype.hasOwnProperty.call(
      input.state,
      "eventDedupGenerationId",
    )
      ? { eventDedupGenerationId: input.state.eventDedupGenerationId ?? null }
      : {}),
    ...(input.state && Object.prototype.hasOwnProperty.call(
      input.state,
      "storyDedupGenerationId",
    )
      ? { storyDedupGenerationId: input.state.storyDedupGenerationId ?? null }
      : {}),
  };

  while (true) {
    const result = await input.runBatch({
      completeThrough: state.completeThrough,
      eventDedupGenerationId: state.eventDedupGenerationId,
      existingFinalizedTermSupport:
        input.useExistingFinalizedTermSupport === true && state.cursor === 0,
      historyDays: state.historyDays,
      promoteGeneration: input.promoteGeneration,
      refreshId: input.refreshId,
      refreshStartedAt: input.refreshStartedAt,
      ...(input.sharedValidationContextSourceId
        ? {
            sharedValidationContextSourceId:
              input.sharedValidationContextSourceId,
          }
        : {}),
      storyDedupGenerationId: state.storyDedupGenerationId,
      termCursor: state.cursor,
    });
    if (result.metricVersion !== input.metricVersion) {
      throw new Error(
        `Signal refresh returned metric ${result.metricVersion}; expected ${input.metricVersion}.`,
      );
    }
    if (
      state.completeThrough &&
      result.completeThrough !== state.completeThrough
    ) {
      throw new Error("Signal refresh changed its saved complete-through date.");
    }
    if (
      state.eventDedupGenerationId !== undefined &&
      result.eventDedupGenerationId !== state.eventDedupGenerationId
    ) {
      throw new Error("Signal refresh changed its pinned event-dedup generation.");
    }
    if (
      state.storyDedupGenerationId !== undefined &&
      result.storyDedupGenerationId !== state.storyDedupGenerationId
    ) {
      throw new Error("Signal refresh changed its pinned story-dedup generation.");
    }
    const nextCursor = result.nextCursor ?? state.cursor;
    if (result.hasMore && nextCursor <= state.cursor) {
      throw new Error("Local signal refresh did not advance its saved cursor.");
    }
    state = {
      ...state,
      cursor: nextCursor,
      completeThrough: result.completeThrough,
      pageCount: state.pageCount + 1,
      observationCount: state.observationCount + result.observationCount,
      processedCandidateTermCount:
        state.processedCandidateTermCount + result.processedCandidateTermCount,
      removedStaleRows: state.removedStaleRows + result.removedStaleRows,
      ...(result.eventDedupGenerationId !== undefined
        ? { eventDedupGenerationId: result.eventDedupGenerationId }
        : {}),
      ...(result.storyDedupGenerationId !== undefined
        ? { storyDedupGenerationId: result.storyDedupGenerationId }
        : {}),
    };
    const progress: LocalSignalRefreshProgress = {
      ...state,
      completeThrough: result.completeThrough,
      required: result.hasMore,
      startDate: result.startDate,
      signalCount: result.signalCount,
      dailyRowCount: result.dailyRowCount,
      metricVersion: result.metricVersion,
      signalStage: result.signalStage,
    };
    await input.checkpoint(progress, result);
    if (!result.hasMore) return progress;
  }
}
