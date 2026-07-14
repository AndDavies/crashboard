import type {
  LocalSignalRefreshProgress,
  LocalSignalRefreshState,
} from "@/lib/intelligence/local-signal-refresh";

export const DEFAULT_BACKFILL_SIGNAL_BATCH_SIZE = 100;
export const DEFAULT_BACKFILL_SIGNAL_HISTORY_DAYS = 395;

export function backfillSignalBatchSize(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(1_000, Math.max(1, Math.floor(parsed)))
    : DEFAULT_BACKFILL_SIGNAL_BATCH_SIZE;
}

type DbObject = Record<string, unknown>;

function object(value: unknown): DbObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DbObject
    : {};
}

function nonNegativeInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : fallback;
}

function validDateOnly(value: unknown) {
  const candidate = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : undefined;
}

function validTimestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function savedGenerationId(
  continuation: DbObject,
  checkpoint: DbObject,
  continuationKey: "eventDedupGenerationId" | "storyDedupGenerationId",
  checkpointKey:
    | "signal_event_dedup_generation_id"
    | "signal_story_dedup_generation_id",
) {
  const source = Object.prototype.hasOwnProperty.call(continuation, continuationKey)
    ? continuation[continuationKey]
    : Object.prototype.hasOwnProperty.call(checkpoint, checkpointKey)
      ? checkpoint[checkpointKey]
      : undefined;
  if (source === undefined) return { present: false, value: undefined } as const;
  if (source === null) return { present: true, value: null } as const;
  const normalized = String(source).trim();
  return { present: true, value: normalized || null } as const;
}

export type BackfillSignalRefreshResume = Omit<
  LocalSignalRefreshState,
  "completeThrough"
> & {
  completeThrough: string;
  refreshId: string;
  refreshStartedAt: string;
};

export function savedBackfillSignalRefresh(
  checkpointValue: unknown,
  input: {
    runId: string;
    completeThrough: string;
    fallbackStartedAt: string;
  },
): BackfillSignalRefreshResume {
  const checkpoint = object(checkpointValue);
  const continuation = object(checkpoint.signal_continuation);
  const phaseMatches = checkpoint.job === "intelligence_v2" &&
    checkpoint.phase === "signals";
  const savedRefreshId = phaseMatches
    ? String(continuation.refreshId ?? checkpoint.signal_refresh_id ?? "").trim()
    : "";
  const refreshId = savedRefreshId || input.runId;
  const refreshStartedAt = phaseMatches
    ? validTimestamp(
        continuation.refreshStartedAt ?? checkpoint.signal_refresh_started_at,
      ) ?? input.fallbackStartedAt
    : input.fallbackStartedAt;
  const completeThrough = validDateOnly(
    phaseMatches
      ? continuation.completeThrough ?? checkpoint.signal_complete_through ??
        checkpoint.completeThrough
      : undefined,
  ) ?? input.completeThrough;
  const historyDays = Math.min(730, Math.max(112, nonNegativeInteger(
    phaseMatches
      ? continuation.historyDays ?? checkpoint.signal_history_days
      : undefined,
    DEFAULT_BACKFILL_SIGNAL_HISTORY_DAYS,
  )));
  const cursor = phaseMatches
    ? nonNegativeInteger(
        continuation.cursor ?? checkpoint.signal_cursor ?? checkpoint.nextCursor ??
          checkpoint.cursor,
      )
    : 0;
  const eventGeneration = savedGenerationId(
    continuation,
    checkpoint,
    "eventDedupGenerationId",
    "signal_event_dedup_generation_id",
  );
  const storyGeneration = savedGenerationId(
    continuation,
    checkpoint,
    "storyDedupGenerationId",
    "signal_story_dedup_generation_id",
  );
  return {
    refreshId,
    refreshStartedAt,
    completeThrough,
    historyDays,
    cursor,
    pageCount: phaseMatches
      ? nonNegativeInteger(checkpoint.signal_page_count)
      : 0,
    observationCount: phaseMatches
      ? nonNegativeInteger(checkpoint.signal_observation_count)
      : 0,
    processedCandidateTermCount: phaseMatches
      ? nonNegativeInteger(checkpoint.signal_processed_candidate_term_count)
      : 0,
    removedStaleRows: phaseMatches
      ? nonNegativeInteger(checkpoint.signal_removed_stale_rows)
      : 0,
    ...(phaseMatches && eventGeneration.present
      ? { eventDedupGenerationId: eventGeneration.value }
      : {}),
    ...(phaseMatches && storyGeneration.present
      ? { storyDedupGenerationId: storyGeneration.value }
      : {}),
  };
}

type BackfillSignalCheckpointState = Omit<
  LocalSignalRefreshState,
  "completeThrough"
> & {
  completeThrough: string;
};

export function backfillSignalStateCheckpoint(
  identity: {
    refreshId: string;
    refreshStartedAt: string;
  },
  state: BackfillSignalCheckpointState,
  options: {
    required?: boolean;
    startDate?: string;
    signalStage?: LocalSignalRefreshProgress["signalStage"];
  } = {},
) {
  const required = options.required ?? true;
  return {
    signal_refresh_id: identity.refreshId,
    signal_refresh_started_at: identity.refreshStartedAt,
    signal_complete_through: state.completeThrough,
    signal_history_days: state.historyDays,
    signal_cursor: state.cursor,
    signal_page_count: state.pageCount,
    signal_observation_count: state.observationCount,
    signal_processed_candidate_term_count:
      state.processedCandidateTermCount,
    signal_removed_stale_rows: state.removedStaleRows,
    ...(state.eventDedupGenerationId !== undefined
      ? { signal_event_dedup_generation_id: state.eventDedupGenerationId }
      : {}),
    ...(state.storyDedupGenerationId !== undefined
      ? { signal_story_dedup_generation_id: state.storyDedupGenerationId }
      : {}),
    signal_has_more: required,
    ...(options.signalStage ? { signal_stage: options.signalStage } : {}),
    nextCursor: required ? state.cursor : null,
    hasMore: required,
    signal_continuation: {
      required,
      strategy: "term_signal_v2",
      cursor: state.cursor,
      refreshId: identity.refreshId,
      refreshStartedAt: identity.refreshStartedAt,
      completeThrough: state.completeThrough,
      ...(state.eventDedupGenerationId !== undefined
        ? { eventDedupGenerationId: state.eventDedupGenerationId }
        : {}),
      ...(options.startDate ? { startDate: options.startDate } : {}),
      historyDays: state.historyDays,
      ...(state.storyDedupGenerationId !== undefined
        ? { storyDedupGenerationId: state.storyDedupGenerationId }
        : {}),
    },
  };
}

export function backfillSignalCheckpoint(
  identity: {
    refreshId: string;
    refreshStartedAt: string;
  },
  progress: LocalSignalRefreshProgress,
) {
  return backfillSignalStateCheckpoint(identity, progress, {
    required: progress.required,
    startDate: progress.startDate,
    signalStage: progress.signalStage,
  });
}

export function isTransientSignalRefreshPageError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error))
    .toLocaleLowerCase("en-CA");
  return /(?:statement timeout|canceling statement|timed? out|timeout|fetch failed|network error|socket hang up|connection (?:reset|terminated|closed)|econnreset|etimedout|\b(?:408|425|429|500|502|503|504)\b)/u
    .test(message);
}

export async function withTransientSignalPageRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    wait?: (attempt: number) => Promise<void>;
    onRetry?: (error: unknown, nextAttempt: number) => void;
  } = {},
) {
  const maxAttempts = Math.min(3, Math.max(1, Math.floor(options.maxAttempts ?? 2)));
  const wait = options.wait ?? ((attempt: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, 250 * attempt)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientSignalRefreshPageError(error)) {
        throw error;
      }
      options.onRetry?.(error, attempt + 1);
      await wait(attempt);
    }
  }
}
