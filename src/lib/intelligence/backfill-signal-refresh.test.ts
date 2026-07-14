import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKFILL_SIGNAL_BATCH_SIZE,
  backfillSignalCheckpoint,
  backfillSignalBatchSize,
  backfillSignalStateCheckpoint,
  savedBackfillSignalRefresh,
  withTransientSignalPageRetry,
} from "@/lib/intelligence/backfill-signal-refresh";
import {
  TERM_SIGNAL_TERM_CURSOR_BASE,
  encodeTermSignalCleanupCursor,
} from "@/lib/intelligence/term-signal-refresh";
import type { LocalSignalRefreshProgress } from "@/lib/intelligence/local-signal-refresh";

const identity = {
  refreshId: "backfill-run-1",
  refreshStartedAt: "2026-07-14T06:00:00.000Z",
};

describe("resumable backfill signal refresh", () => {
  it.each([
    ["support", 250],
    ["term", TERM_SIGNAL_TERM_CURSOR_BASE + 123],
    ["cleanup", encodeTermSignalCleanupCursor(73, 4)],
  ])("preserves the exact %s cursor space", (_stage, expectedCursor) => {
    const restored = savedBackfillSignalRefresh({
      job: "intelligence_v2",
      phase: "signals",
      // These generic values must never override the dedicated continuation.
      cursor: 1,
      nextCursor: expectedCursor + 99,
      signal_cursor: expectedCursor + 50,
      signal_page_count: 8,
      signal_observation_count: 90,
      signal_processed_candidate_term_count: 14,
      signal_removed_stale_rows: 3,
      signal_continuation: {
        strategy: "term_signal_v2",
        cursor: expectedCursor,
        refreshId: identity.refreshId,
        refreshStartedAt: identity.refreshStartedAt,
        completeThrough: "2026-07-13",
        historyDays: 395,
        eventDedupGenerationId: "event-generation-saved",
        storyDedupGenerationId: "story-generation-saved",
      },
    }, {
      runId: "different-default-run",
      completeThrough: "2026-07-12",
      fallbackStartedAt: "2026-07-14T07:00:00.000Z",
    });

    expect(restored).toEqual({
      ...identity,
      cursor: expectedCursor,
      completeThrough: "2026-07-13",
      historyDays: 395,
      pageCount: 8,
      observationCount: 90,
      processedCandidateTermCount: 14,
      removedStaleRows: 3,
      eventDedupGenerationId: "event-generation-saved",
      storyDedupGenerationId: "story-generation-saved",
    });
  });

  it("writes a complete page checkpoint that round-trips without changing generations", () => {
    const progress: LocalSignalRefreshProgress = {
      cursor: TERM_SIGNAL_TERM_CURSOR_BASE + 27,
      completeThrough: "2026-07-13",
      historyDays: 395,
      pageCount: 11,
      observationCount: 1_240,
      processedCandidateTermCount: 27,
      removedStaleRows: 0,
      required: true,
      startDate: "2025-06-14",
      signalCount: 0,
      dailyRowCount: 0,
      metricVersion: "signals-v2.1.0",
      signalStage: "terms",
      eventDedupGenerationId: "event-generation-current",
      storyDedupGenerationId: "story-generation-current",
    };
    const checkpoint = {
      job: "intelligence_v2",
      phase: "signals",
      ...backfillSignalCheckpoint(identity, progress),
    };

    expect(checkpoint).toMatchObject({
      signal_refresh_id: identity.refreshId,
      signal_refresh_started_at: identity.refreshStartedAt,
      signal_complete_through: "2026-07-13",
      signal_cursor: progress.cursor,
      signal_has_more: true,
      signal_stage: "terms",
      nextCursor: progress.cursor,
      signal_continuation: {
        required: true,
        cursor: progress.cursor,
        refreshId: identity.refreshId,
        refreshStartedAt: identity.refreshStartedAt,
        completeThrough: "2026-07-13",
        eventDedupGenerationId: "event-generation-current",
        storyDedupGenerationId: "story-generation-current",
      },
    });
    expect(savedBackfillSignalRefresh(checkpoint, {
      runId: "fallback",
      completeThrough: "2026-07-12",
      fallbackStartedAt: "2026-07-14T07:00:00.000Z",
    })).toMatchObject({
      ...identity,
      cursor: progress.cursor,
      completeThrough: progress.completeThrough,
      pageCount: progress.pageCount,
      observationCount: progress.observationCount,
      processedCandidateTermCount: progress.processedCandidateTermCount,
      eventDedupGenerationId: "event-generation-current",
      storyDedupGenerationId: "story-generation-current",
    });
  });

  it("persists generation identity before the first page at the conservative default", () => {
    expect(DEFAULT_BACKFILL_SIGNAL_BATCH_SIZE).toBe(100);
    expect(backfillSignalBatchSize(undefined)).toBe(100);
    expect(backfillSignalBatchSize("75")).toBe(75);
    expect(backfillSignalBatchSize("invalid")).toBe(100);
    expect(backfillSignalBatchSize(10_000)).toBe(1_000);
    const checkpoint = backfillSignalStateCheckpoint(identity, {
      cursor: 0,
      completeThrough: "2026-07-13",
      historyDays: 395,
      pageCount: 0,
      observationCount: 0,
      processedCandidateTermCount: 0,
      removedStaleRows: 0,
    });
    expect(checkpoint).toMatchObject({
      signal_cursor: 0,
      signal_has_more: true,
      nextCursor: 0,
      signal_continuation: {
        required: true,
        cursor: 0,
        refreshId: identity.refreshId,
        refreshStartedAt: identity.refreshStartedAt,
        completeThrough: "2026-07-13",
      },
    });
  });

  it("retries one transient page failure without changing the operation", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"))
      .mockResolvedValueOnce({ nextCursor: 100 });
    const onRetry = vi.fn();

    await expect(withTransientSignalPageRetry(operation, {
      wait: async () => undefined,
      onRetry,
    })).resolves.toEqual({ nextCursor: 100 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it("does not retry permanent errors or exceed the configured attempt limit", async () => {
    const permanent = vi.fn().mockRejectedValue(new Error("invalid owner"));
    await expect(withTransientSignalPageRetry(permanent, {
      wait: async () => undefined,
    })).rejects.toThrow("invalid owner");
    expect(permanent).toHaveBeenCalledTimes(1);

    const transient = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(withTransientSignalPageRetry(transient, {
      maxAttempts: 2,
      wait: async () => undefined,
    })).rejects.toThrow("network error");
    expect(transient).toHaveBeenCalledTimes(2);
  });
});
