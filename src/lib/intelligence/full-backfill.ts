export type FullBackfillBatchResult = {
  runId: string | null;
  discovered: number;
  processed: number;
  failed: number;
  excluded: number;
  pending: number;
  deadLettered: number;
  hasMore: boolean;
};

export type FullBackfillProgress = {
  batches: number;
  processed: number;
  failedAttempts: number;
  excluded: number;
  pending: number;
  deadLettered: number;
  complete: boolean;
  stopped: boolean;
  lastRunId: string | null;
};

export class FullBackfillStalledError extends Error {
  constructor(
    readonly progress: FullBackfillProgress,
    stalledBatches: number,
  ) {
    super(
      `Full backfill made no progress for ${stalledBatches} consecutive batches.`,
    );
    this.name = "FullBackfillStalledError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function parseFullBackfillBatchResponse(
  payload: unknown,
): FullBackfillBatchResult {
  const result = record(record(payload)?.result);
  if (!result || typeof result.hasMore !== "boolean") {
    throw new Error("Full backfill returned an invalid checkpoint response.");
  }

  return {
    runId: typeof result.runId === "string" ? result.runId : null,
    discovered: count(result.discovered),
    processed: count(result.processed),
    failed: count(result.failed),
    excluded: count(result.excluded),
    pending: count(result.pending),
    deadLettered: count(result.deadLettered),
    hasMore: result.hasMore,
  };
}

export async function runFullBackfillBatches({
  runBatch,
  shouldStop = () => false,
  onProgress = () => undefined,
  waitBetweenBatches = () => Promise.resolve(),
  stalledBatchLimit = 2,
}: {
  runBatch: () => Promise<FullBackfillBatchResult>;
  shouldStop?: () => boolean;
  onProgress?: (progress: FullBackfillProgress) => void | Promise<void>;
  waitBetweenBatches?: () => Promise<void>;
  stalledBatchLimit?: number;
}) {
  const stallLimit = Math.max(1, Math.floor(stalledBatchLimit));
  let stalledBatches = 0;
  let progress: FullBackfillProgress = {
    batches: 0,
    processed: 0,
    failedAttempts: 0,
    excluded: 0,
    pending: 0,
    deadLettered: 0,
    complete: false,
    stopped: false,
    lastRunId: null,
  };

  while (true) {
    if (progress.batches > 0 && shouldStop()) {
      progress = { ...progress, stopped: true };
      await onProgress(progress);
      return progress;
    }

    const batch = await runBatch();
    progress = {
      batches: progress.batches + 1,
      processed: progress.processed + batch.processed,
      failedAttempts: progress.failedAttempts + batch.failed,
      excluded: progress.excluded + batch.excluded,
      pending: batch.pending,
      deadLettered: batch.deadLettered,
      complete: !batch.hasMore,
      stopped: false,
      lastRunId: batch.runId,
    };
    await onProgress(progress);

    if (!batch.hasMore) return progress;

    if (shouldStop()) {
      progress = { ...progress, stopped: true };
      await onProgress(progress);
      return progress;
    }

    const madeProgress = batch.processed + batch.failed + batch.excluded > 0;
    stalledBatches = madeProgress ? 0 : stalledBatches + 1;
    if (stalledBatches >= stallLimit) {
      throw new FullBackfillStalledError(progress, stalledBatches);
    }

    await waitBetweenBatches();
  }
}
