import { describe, expect, it, vi } from "vitest";
import {
  FullBackfillStalledError,
  parseFullBackfillBatchResponse,
  runFullBackfillBatches,
  type FullBackfillBatchResult,
} from "@/lib/intelligence/full-backfill";

function batch(
  overrides: Partial<FullBackfillBatchResult> = {},
): FullBackfillBatchResult {
  return {
    runId: "run-1",
    discovered: 10,
    processed: 8,
    failed: 0,
    excluded: 0,
    pending: 0,
    deadLettered: 0,
    hasMore: true,
    ...overrides,
  };
}

describe("parseFullBackfillBatchResponse", () => {
  it("normalizes the bounded sync response", () => {
    expect(
      parseFullBackfillBatchResponse({
        result: {
          runId: "run-7",
          discovered: 10,
          processed: 9,
          failed: 1,
          excluded: 2,
          pending: 1,
          deadLettered: 3,
          hasMore: true,
        },
      }),
    ).toEqual({
      runId: "run-7",
      discovered: 10,
      processed: 9,
      failed: 1,
      excluded: 2,
      pending: 1,
      deadLettered: 3,
      hasMore: true,
    });
  });

  it("rejects a response without an authoritative hasMore flag", () => {
    expect(() => parseFullBackfillBatchResponse({ result: { processed: 10 } })).toThrow(
      "invalid checkpoint response",
    );
  });
});

describe("runFullBackfillBatches", () => {
  it("runs sequentially until the checkpoint is complete and aggregates counts", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const responses = [
      batch({ runId: "run-1", processed: 8, pending: 2 }),
      batch({ runId: "run-2", discovered: 2, processed: 2 }),
      batch({
        runId: "run-3",
        discovered: 4,
        processed: 3,
        failed: 1,
        excluded: 1,
        deadLettered: 1,
        hasMore: false,
      }),
    ];
    const runBatch = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      const response = responses.shift();
      inFlight -= 1;
      if (!response) throw new Error("Unexpected batch.");
      return response;
    });
    const waitBetweenBatches = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    const result = await runFullBackfillBatches({
      runBatch,
      waitBetweenBatches,
      onProgress,
    });

    expect(maxInFlight).toBe(1);
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(waitBetweenBatches).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      batches: 3,
      processed: 13,
      failedAttempts: 1,
      excluded: 1,
      pending: 0,
      deadLettered: 1,
      complete: true,
      stopped: false,
      lastRunId: "run-3",
    });
  });

  it("stops after the active batch without starting another request", async () => {
    let stopRequested = false;
    const runBatch = vi.fn().mockResolvedValue(batch({ processed: 7, pending: 3 }));

    const result = await runFullBackfillBatches({
      runBatch,
      shouldStop: () => stopRequested,
      onProgress: () => {
        stopRequested = true;
      },
    });

    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      batches: 1,
      processed: 7,
      pending: 3,
      complete: false,
      stopped: true,
    });
  });

  it("honors a stop request made during the inter-batch pause", async () => {
    let stopRequested = false;
    const runBatch = vi.fn().mockResolvedValue(batch({ processed: 6, pending: 4 }));

    const result = await runFullBackfillBatches({
      runBatch,
      shouldStop: () => stopRequested,
      waitBetweenBatches: async () => {
        stopRequested = true;
      },
    });

    expect(runBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      batches: 1,
      processed: 6,
      pending: 4,
      complete: false,
      stopped: true,
    });
  });

  it("stops chaining immediately when a later request fails", async () => {
    const runBatch = vi
      .fn()
      .mockResolvedValueOnce(batch())
      .mockRejectedValueOnce(new Error("Another sync owns the source lock."));

    await expect(
      runFullBackfillBatches({ runBatch, waitBetweenBatches: () => Promise.resolve() }),
    ).rejects.toThrow("owns the source lock");
    expect(runBatch).toHaveBeenCalledTimes(2);
  });

  it("halts after repeated zero-progress checkpoints", async () => {
    const runBatch = vi.fn().mockResolvedValue(
      batch({
        runId: "stalled-run",
        discovered: 10,
        processed: 0,
        failed: 0,
        excluded: 0,
        hasMore: true,
      }),
    );

    await expect(
      runFullBackfillBatches({
        runBatch,
        waitBetweenBatches: () => Promise.resolve(),
        stalledBatchLimit: 2,
      }),
    ).rejects.toBeInstanceOf(FullBackfillStalledError);
    expect(runBatch).toHaveBeenCalledTimes(2);
  });
});
