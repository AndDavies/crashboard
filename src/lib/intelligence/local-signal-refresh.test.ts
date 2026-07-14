import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_SIGNAL_REFRESH_JOB,
  LOCAL_SIGNAL_REFRESH_MODE_CLONED,
  LOCAL_SIGNAL_REFRESH_MODE_CURRENT,
  completedBackfillTermSupportSnapshot,
  legacySignalAnchorForCompleteThrough,
  completedPostBackfillRefreshGenerationId,
  localCurrentWindowRefreshRunId,
  localEvaluationSignalSnapshotFromCheckpoint,
  localSignalRefreshCanBeReclaimed,
  localSignalRefreshLeaseMatches,
  localSignalRefreshLeaseIsActive,
  localSignalRefreshModeFromCheckpoint,
  localSignalRefreshRunId,
  localSignalRefreshStateFromCheckpoint,
  localSignalScoringIsComplete,
  localValidationStateMatchesSupportSnapshot,
  planLocalSignalRefresh,
  qualifiesCompletedClonedValidationRefresh,
  qualifiesCompletedCurrentWindowRefresh,
  qualifiesCompletedPostBackfillRefresh,
  remainingPostBackfillRefreshes,
  runBoundedLocalValidationGenerationPrune,
  runLocalSignalRefreshPages,
  shouldReleaseClonedValidationContext,
  type LocalSignalRefreshBatchInput,
  type LocalSignalRefreshBatchResult,
} from "@/lib/intelligence/local-signal-refresh";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";

function result(
  overrides: Partial<LocalSignalRefreshBatchResult> = {},
): LocalSignalRefreshBatchResult {
  return {
    completeThrough: "2026-07-13",
    startDate: "2025-06-14",
    observationCount: 0,
    processedCandidateTermCount: 0,
    signalCount: 0,
    dailyRowCount: 0,
    removedStaleRows: 0,
    hasMore: true,
    nextCursor: 500,
    metricVersion: "signals-v2.1.0",
    signalStage: "support",
    ...overrides,
  };
}

describe("local recorded signal refresh", () => {
  it("resumes compact snapshot and pruning phases without rescoring", () => {
    const identity = {
      refreshId: "validation-refresh",
      startDate: "2025-06-13",
      completeThrough: "2026-07-12",
      metricVersion: "signals-v2.1.0",
    };
    const checkpoint = {
      phase: "validation_pruning",
      signal_continuation: { required: false },
      evaluation_signal_snapshot: {
        ...identity,
        fingerprintVersion: "signal-fingerprint-v2.0.0",
        signalRowCount: 193_000,
        signalSnapshotFingerprint: "series-sha",
        completeDaySignalCount: 599,
        topicLabelCount: 546,
        topicLabelFingerprint: "labels-sha",
      },
    };
    expect(localSignalScoringIsComplete(checkpoint)).toBe(true);
    expect(localEvaluationSignalSnapshotFromCheckpoint(checkpoint, identity))
      .toMatchObject({ signalRowCount: 193_000, topicLabelCount: 546 });
    expect(localEvaluationSignalSnapshotFromCheckpoint(checkpoint, {
      ...identity,
      refreshId: "another-refresh",
    })).toBeNull();
    expect(localSignalScoringIsComplete({
      ...checkpoint,
      signal_continuation: { required: true },
    })).toBe(false);
  });

  it("prunes one temporary validation generation resumably and idempotently", async () => {
    const pruneBatch = vi.fn()
      .mockResolvedValueOnce({
        signalRowsDeleted: 2_500,
        totalRowsDeleted: 395,
        generationDeleted: false,
        alreadyPruned: false,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        signalRowsDeleted: 300,
        totalRowsDeleted: 0,
        generationDeleted: true,
        alreadyPruned: false,
        hasMore: false,
      });
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    const completed = await runBoundedLocalValidationGenerationPrune({
      state: {
        pages: 4,
        signalRowsDeleted: 10_000,
        totalRowsDeleted: 395,
      },
      pruneBatch,
      checkpoint,
    });
    expect(completed).toEqual({
      pages: 6,
      signalRowsDeleted: 12_800,
      totalRowsDeleted: 790,
      generationDeleted: true,
      alreadyPruned: false,
      complete: true,
    });
    expect(checkpoint).toHaveBeenCalledTimes(2);

    const alreadyCompleteBatch = vi.fn();
    await expect(runBoundedLocalValidationGenerationPrune({
      state: completed,
      pruneBatch: alreadyCompleteBatch,
      checkpoint: async () => undefined,
    })).resolves.toEqual(completed);
    expect(alreadyCompleteBatch).not.toHaveBeenCalled();
  });

  it("releases the cloned context before current-window or terminal plans", () => {
    expect(shouldReleaseClonedValidationContext({
      kind: "cloned_validation",
      sequence: 6,
    })).toBe(false);
    expect(shouldReleaseClonedValidationContext({
      kind: "current_window",
      completeThrough: "2026-07-13",
      sequence: 7,
    })).toBe(true);
    expect(shouldReleaseClonedValidationContext({
      kind: "complete",
      reason: "target_reached",
    })).toBe(true);
  });

  it("accepts only one completed backfill support identity and exact window", () => {
    const completed = {
      id: "backfill-1",
      status: "completed",
      checkpoint_after: {
        job: "intelligence_v2",
        phase: "complete",
        signal_refresh_id: "backfill-refresh-1",
        signal_complete_through: "2026-07-12",
        signal_continuation: {
          required: false,
          strategy: "term_signal_v2",
          refreshId: "backfill-refresh-1",
          completeThrough: "2026-07-12",
          startDate: "2025-06-13",
        },
        signals: {
          refreshId: "backfill-refresh-1",
          metricVersion: "signals-v2.1.0",
          startDate: "2025-06-13",
          completeThrough: "2026-07-12",
        },
      },
    };
    expect(completedBackfillTermSupportSnapshot(completed, {
      metricVersion: "signals-v2.1.0",
      extractionVersion: "terms-v2.0.0",
    })).toEqual({
      sourceRefreshId: "backfill-refresh-1",
      extractionVersion: "terms-v2.0.0",
      startDate: "2025-06-13",
      endDate: "2026-07-12",
      historyDays: 395,
    });
    const snapshot = completedBackfillTermSupportSnapshot(completed, {
      metricVersion: "signals-v2.1.0",
      extractionVersion: "terms-v2.0.0",
    })!;
    expect(localValidationStateMatchesSupportSnapshot({
      completeThrough: undefined,
      historyDays: 395,
    }, snapshot)).toBe(true);
    expect(localValidationStateMatchesSupportSnapshot({
      completeThrough: "2026-07-13",
      historyDays: 395,
    }, snapshot)).toBe(false);
    expect(completedBackfillTermSupportSnapshot({
      ...completed,
      checkpoint_after: {
        ...completed.checkpoint_after,
        signal_refresh_id: "conflicting-refresh",
      },
    }, {
      metricVersion: "signals-v2.1.0",
      extractionVersion: "terms-v2.0.0",
    })).toBeNull();
    expect(completedBackfillTermSupportSnapshot({
      ...completed,
      status: "partial",
    }, {
      metricVersion: "signals-v2.1.0",
      extractionVersion: "terms-v2.0.0",
    })).toBeNull();
  });

  it("keeps one generation/window, checkpoints every page, and aggregates resume-safe counts", async () => {
    const responses = [
      result(),
      result({
        observationCount: 18,
        processedCandidateTermCount: 4,
        nextCursor: 1_000_000_004,
        signalStage: "terms",
        eventDedupGenerationId: "event-generation-1",
        storyDedupGenerationId: "story-generation-1",
      }),
      result({
        signalCount: 73,
        dailyRowCount: 2_100,
        removedStaleRows: 12,
        hasMore: false,
        nextCursor: null,
        signalStage: "cleanup",
        eventDedupGenerationId: "event-generation-1",
        storyDedupGenerationId: "story-generation-1",
      }),
    ];
    const runBatch = vi.fn(async (page: LocalSignalRefreshBatchInput) => {
      void page;
      const next = responses.shift();
      if (!next) throw new Error("Unexpected page.");
      return next;
    });
    const checkpoint = vi.fn().mockResolvedValue(undefined);

    const summary = await runLocalSignalRefreshPages({
      refreshId: "run-1",
      refreshStartedAt: "2026-07-14T01:00:00.000Z",
      metricVersion: "signals-v2.1.0",
      runBatch,
      checkpoint,
    });

    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(runBatch.mock.calls.map(([page]) => page)).toEqual([
      expect.objectContaining({
        completeThrough: undefined,
        refreshId: "run-1",
        refreshStartedAt: "2026-07-14T01:00:00.000Z",
        termCursor: 0,
      }),
      expect.objectContaining({ completeThrough: "2026-07-13", termCursor: 500 }),
      expect.objectContaining({
        completeThrough: "2026-07-13",
        termCursor: 1_000_000_004,
        eventDedupGenerationId: "event-generation-1",
        storyDedupGenerationId: "story-generation-1",
      }),
    ]);
    expect(checkpoint).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({
      required: false,
      pageCount: 3,
      completeThrough: "2026-07-13",
      observationCount: 18,
      processedCandidateTermCount: 4,
      removedStaleRows: 12,
      signalCount: 73,
      dailyRowCount: 2_100,
      eventDedupGenerationId: "event-generation-1",
      storyDedupGenerationId: "story-generation-1",
    });
  });

  it("resumes from durable counters and refuses a non-advancing page", async () => {
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    await expect(runLocalSignalRefreshPages({
      refreshId: "run-2",
      refreshStartedAt: "2026-07-14T02:00:00.000Z",
      metricVersion: "signals-v2.1.0",
      state: {
        cursor: 750,
        completeThrough: "2026-07-13",
        pageCount: 2,
        observationCount: 10,
      },
      runBatch: async () => result({ nextCursor: 750 }),
      checkpoint,
    })).rejects.toThrow("did not advance");
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it("uses cloned finalized support only for the cursor-zero entrance", async () => {
    const runBatch = vi.fn()
      .mockResolvedValueOnce(result({
        nextCursor: 1_000_000_004,
        signalStage: "terms",
      }))
      .mockResolvedValueOnce(result({
        hasMore: false,
        nextCursor: null,
        signalStage: "terms",
      }));
    await runLocalSignalRefreshPages({
      refreshId: "cloned-run",
      refreshStartedAt: "2026-07-14T02:15:00.000Z",
      metricVersion: "signals-v2.1.0",
      promoteGeneration: false,
      useExistingFinalizedTermSupport: true,
      sharedValidationContextSourceId: "backfill-refresh-1",
      state: {
        cursor: 0,
        completeThrough: "2026-07-13",
        historyDays: 395,
      },
      runBatch,
      checkpoint: async () => undefined,
    });
    expect(runBatch.mock.calls[0]?.[0]).toMatchObject({
      termCursor: 0,
      existingFinalizedTermSupport: true,
      promoteGeneration: false,
      sharedValidationContextSourceId: "backfill-refresh-1",
    });
    expect(runBatch.mock.calls[1]?.[0]).toMatchObject({
      termCursor: 1_000_000_004,
      existingFinalizedTermSupport: false,
      promoteGeneration: false,
      sharedValidationContextSourceId: "backfill-refresh-1",
    });
  });

  it("runs a pinned current window from cursor zero without cloned support", async () => {
    const runBatch = vi.fn().mockResolvedValue(result({
      hasMore: false,
      nextCursor: null,
      signalStage: "cleanup",
    }));
    await runLocalSignalRefreshPages({
      refreshId: "current-window-run",
      refreshStartedAt: "2026-07-14T02:20:00.000Z",
      metricVersion: "signals-v2.1.0",
      promoteGeneration: true,
      useExistingFinalizedTermSupport: false,
      state: {
        cursor: 0,
        completeThrough: "2026-07-13",
        historyDays: 395,
      },
      runBatch,
      checkpoint: async () => undefined,
    });
    expect(runBatch).toHaveBeenCalledWith(expect.objectContaining({
      completeThrough: "2026-07-13",
      existingFinalizedTermSupport: false,
      promoteGeneration: true,
      termCursor: 0,
    }));
    expect(runBatch.mock.calls[0]?.[0]).not.toHaveProperty(
      "sharedValidationContextSourceId",
    );
  });

  it("fails closed when a resumed page changes a pinned dedup generation", async () => {
    const checkpoint = vi.fn().mockResolvedValue(undefined);
    await expect(runLocalSignalRefreshPages({
      refreshId: "run-generation-guard",
      refreshStartedAt: "2026-07-14T02:30:00.000Z",
      metricVersion: "signals-v2.1.0",
      state: {
        cursor: 1_000_000_004,
        completeThrough: "2026-07-13",
        eventDedupGenerationId: "event-generation-original",
        storyDedupGenerationId: "story-generation-original",
      },
      runBatch: async () => result({
        nextCursor: 1_000_000_005,
        signalStage: "terms",
        eventDedupGenerationId: "event-generation-replaced",
        storyDedupGenerationId: "story-generation-original",
      }),
      checkpoint,
    })).rejects.toThrow("changed its pinned event-dedup generation");
    expect(checkpoint).not.toHaveBeenCalled();
  });

  it("restores only a matching local continuation", () => {
    expect(localSignalRefreshStateFromCheckpoint({
      job: LOCAL_SIGNAL_REFRESH_JOB,
      signal_page_count: 7,
      observation_count: 91,
      processed_candidate_term_count: 14,
      removed_stale_rows: 3,
      signal_continuation: {
        strategy: "term_signal_v2",
        cursor: 1_000_000_014,
        refreshId: "run-3",
        refreshStartedAt: "2026-07-14T03:00:00.000Z",
        completeThrough: "2026-07-13",
        historyDays: 395,
        eventDedupGenerationId: "event-generation-saved",
        storyDedupGenerationId: "story-generation-saved",
      },
    }, {
      runId: "run-3",
      startedAt: "2026-07-14T03:00:00.000Z",
    })).toEqual({
      cursor: 1_000_000_014,
      completeThrough: "2026-07-13",
      historyDays: 395,
      pageCount: 7,
      observationCount: 91,
      processedCandidateTermCount: 14,
      removedStaleRows: 3,
      eventDedupGenerationId: "event-generation-saved",
      storyDedupGenerationId: "story-generation-saved",
    });
    expect(localSignalRefreshStateFromCheckpoint({
      job: LOCAL_SIGNAL_REFRESH_JOB,
      signal_continuation: {
        strategy: "term_signal_v2",
        refreshId: "different-run",
        refreshStartedAt: "2026-07-14T03:00:00.000Z",
      },
    }, {
      runId: "run-3",
      startedAt: "2026-07-14T03:00:00.000Z",
    })).toBeNull();
    expect(localSignalRefreshStateFromCheckpoint({
      job: LOCAL_SIGNAL_REFRESH_JOB,
      signal_continuation: {
        strategy: "term_signal_v2",
        cursor: 500,
        refreshId: "run-3",
        refreshStartedAt: "2026-07-14T03:00:00.000Z",
      },
    }, {
      runId: "run-3",
      startedAt: "2026-07-14T03:00:00.000Z",
    })).toBeNull();
  });

  it("makes the target idempotent and treats a recent heartbeat as an active lease", () => {
    expect(remainingPostBackfillRefreshes({
      target: 6,
      completedMetricVersions: [
        "signals-v2.1.0",
        "signals-v2.0.0",
        "signals-v2.1.0",
      ],
      metricVersion: "signals-v2.1.0",
    })).toBe(4);
    const now = Date.parse("2026-07-14T04:00:00.000Z");
    expect(localSignalRefreshLeaseIsActive("2026-07-14T03:58:00.000Z", now)).toBe(true);
    expect(localSignalRefreshLeaseIsActive("2026-07-14T03:50:00.000Z", now)).toBe(false);
    expect(localSignalRefreshCanBeReclaimed(
      "running",
      "2026-07-14T03:58:00.000Z",
      now,
    )).toBe(false);
    expect(localSignalRefreshCanBeReclaimed(
      "running",
      "2026-07-14T03:50:00.000Z",
      now,
    )).toBe(true);
    expect(localSignalRefreshCanBeReclaimed(
      "partial",
      "2026-07-14T03:58:00.000Z",
      now,
    )).toBe(true);
    expect(localSignalRefreshLeaseMatches({ lease_token: "current" }, "current"))
      .toBe(true);
    expect(localSignalRefreshLeaseMatches({ lease_token: "new-owner" }, "stale-owner"))
      .toBe(false);

    const firstId = localSignalRefreshRunId("backfill-1", 1, "signals-v2.1.0");
    expect(firstId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(localSignalRefreshRunId("backfill-1", 1, "signals-v2.1.0"))
      .toBe(firstId);
    expect(localSignalRefreshRunId("backfill-1", 2, "signals-v2.1.0"))
      .not.toBe(firstId);
    expect(latestCompleteDateKey(
      legacySignalAnchorForCompleteThrough("2026-07-13"),
    )).toBe("2026-07-13");
  });

  it("finishes cloned validations before planning one current-window run", () => {
    expect(planLocalSignalRefresh({
      target: 6,
      completedClonedRefreshes: 5,
      requireCurrentWindow: true,
      currentWindowCompleted: false,
      latestCompleteThrough: "2026-07-13",
      supportEndDate: "2026-07-12",
    })).toEqual({ kind: "cloned_validation", sequence: 6 });
    expect(planLocalSignalRefresh({
      target: 6,
      completedClonedRefreshes: 6,
      requireCurrentWindow: true,
      currentWindowCompleted: false,
      latestCompleteThrough: "2026-07-13",
      supportEndDate: "2026-07-12",
    })).toEqual({
      kind: "current_window",
      completeThrough: "2026-07-13",
      sequence: 7,
    });
    expect(planLocalSignalRefresh({
      target: 6,
      completedClonedRefreshes: 6,
      requireCurrentWindow: true,
      currentWindowCompleted: true,
      latestCompleteThrough: "2026-07-13",
      supportEndDate: "2026-07-12",
    })).toEqual({
      kind: "complete",
      reason: "current_window_already_complete",
    });
    expect(planLocalSignalRefresh({
      target: 6,
      completedClonedRefreshes: 6,
      requireCurrentWindow: true,
      currentWindowCompleted: false,
      latestCompleteThrough: "2026-07-12",
      supportEndDate: "2026-07-12",
    })).toEqual({ kind: "complete", reason: "current_window_not_newer" });
    expect(planLocalSignalRefresh({
      target: 6,
      completedClonedRefreshes: 6,
      requireCurrentWindow: false,
      currentWindowCompleted: false,
      latestCompleteThrough: "2026-07-13",
      supportEndDate: "2026-07-12",
    })).toEqual({ kind: "complete", reason: "target_reached" });
  });

  it("distinguishes completed cloned and current-window local runs", () => {
    const base = {
      id: "local-clone",
      status: "completed",
      completed_at: "2026-07-14T06:00:00.000Z",
      checkpoint_after: {
        job: LOCAL_SIGNAL_REFRESH_JOB,
        phase: "complete",
        validation_mode: LOCAL_SIGNAL_REFRESH_MODE_CLONED,
        backfill_run_id: "backfill-1",
        target_additional_refreshes: 6,
        series_index: 6,
        metric_version: "signals-v2.1.0",
        refresh_id: "local-clone",
        refresh_started_at: "2026-07-14T05:30:00.000Z",
        complete_through: "2026-07-12",
        v2_signal_count: 70,
        v2_daily_row_count: 2_000,
        legacy_snapshot_count: 300,
        validation_generation_pruned: true,
        evaluation_signal_snapshot: {
          refreshId: "local-clone",
          startDate: "2025-06-13",
          completeThrough: "2026-07-12",
          metricVersion: "signals-v2.1.0",
          fingerprintVersion: "signal-fingerprint-v2.0.0",
          signalRowCount: 2_000,
          signalSnapshotFingerprint: "signal-fingerprint",
          completeDaySignalCount: 70,
          topicLabelCount: 50,
          topicLabelFingerprint: "topic-label-fingerprint",
        },
        signal_continuation: {
          required: false,
          strategy: "term_signal_v2",
          refreshId: "local-clone",
          refreshStartedAt: "2026-07-14T05:30:00.000Z",
          completeThrough: "2026-07-12",
          startDate: "2025-06-13",
        },
      },
    };
    const shared = {
      backfillId: "backfill-1",
      backfillCompletedAt: "2026-07-14T04:00:00.000Z",
      metricVersion: "signals-v2.1.0",
    };
    expect(qualifiesCompletedClonedValidationRefresh(base, {
      ...shared,
      supportEndDate: "2026-07-12",
      target: 6,
    })).toBe(true);
    expect(qualifiesCompletedClonedValidationRefresh({
      ...base,
      checkpoint_after: {
        ...base.checkpoint_after,
        validation_mode: undefined,
      },
    }, {
      ...shared,
      supportEndDate: "2026-07-12",
      target: 6,
    })).toBe(true);
    expect(qualifiesCompletedCurrentWindowRefresh(base, {
      ...shared,
      completeThrough: "2026-07-13",
    })).toBe(false);

    const current = {
      ...base,
      id: "local-current",
      checkpoint_after: {
        ...base.checkpoint_after,
        validation_mode: LOCAL_SIGNAL_REFRESH_MODE_CURRENT,
        series_index: 7,
        refresh_id: "local-current",
        complete_through: "2026-07-13",
        signal_continuation: {
          ...base.checkpoint_after.signal_continuation,
          refreshId: "local-current",
          completeThrough: "2026-07-13",
        },
      },
    };
    expect(qualifiesCompletedCurrentWindowRefresh(current, {
      ...shared,
      completeThrough: "2026-07-13",
    })).toBe(true);
    expect(qualifiesCompletedClonedValidationRefresh(current, {
      ...shared,
      supportEndDate: "2026-07-12",
      target: 6,
    })).toBe(false);
    expect(localSignalRefreshModeFromCheckpoint(base.checkpoint_after))
      .toBe(LOCAL_SIGNAL_REFRESH_MODE_CLONED);
    expect(localSignalRefreshModeFromCheckpoint(current.checkpoint_after))
      .toBe(LOCAL_SIGNAL_REFRESH_MODE_CURRENT);
    expect(localSignalRefreshModeFromCheckpoint({
      ...base.checkpoint_after,
      validation_mode: undefined,
    })).toBe(LOCAL_SIGNAL_REFRESH_MODE_CLONED);

    const firstCurrentId = localCurrentWindowRefreshRunId(
      "backfill-1",
      "2026-07-13",
      "signals-v2.1.0",
    );
    expect(firstCurrentId).toBe(localCurrentWindowRefreshRunId(
      "backfill-1",
      "2026-07-13",
      "signals-v2.1.0",
    ));
    expect(firstCurrentId).not.toBe(localCurrentWindowRefreshRunId(
      "backfill-1",
      "2026-07-14",
      "signals-v2.1.0",
    ));
    expect(firstCurrentId).not.toBe(localSignalRefreshRunId(
      "backfill-1",
      7,
      "signals-v2.1.0",
    ));
  });

  it("counts only fully paired, terminal refresh records", () => {
    const scheduled = {
      id: "scheduled-run",
      status: "completed",
      completed_at: "2026-07-14T05:00:00.000Z",
      checkpoint_after: {
        backfill_run_id: "backfill-1",
        metric_version: "signals-v2.1.0",
        refresh_id: "scheduled-generation",
        refresh_started_at: "2026-07-14T04:30:00.000Z",
        complete_through: "2026-07-13",
        v2_signal_count: 70,
        v2_daily_row_count: 2_000,
        legacy_snapshot_count: 300,
      },
    };
    const local = {
      id: "local-run",
      status: "completed",
      completed_at: "2026-07-14T06:00:00.000Z",
      checkpoint_after: {
        job: LOCAL_SIGNAL_REFRESH_JOB,
        phase: "complete",
        backfill_run_id: "backfill-1",
        metric_version: "signals-v2.1.0",
        refresh_id: "local-run",
        refresh_started_at: "2026-07-14T05:30:00.000Z",
        complete_through: "2026-07-13",
        v2_signal_count: 70,
        v2_daily_row_count: 2_000,
        legacy_snapshot_count: 300,
        signal_continuation: {
          required: false,
          strategy: "term_signal_v2",
          refreshId: "local-run",
          refreshStartedAt: "2026-07-14T05:30:00.000Z",
          completeThrough: "2026-07-13",
        },
      },
    };
    const input = {
      backfillId: "backfill-1",
      backfillCompletedAt: "2026-07-14T04:00:00.000Z",
      metricVersion: "signals-v2.1.0",
    };
    expect(qualifiesCompletedPostBackfillRefresh(scheduled, input)).toBe(true);
    expect(qualifiesCompletedPostBackfillRefresh(local, input)).toBe(true);
    expect(completedPostBackfillRefreshGenerationId(scheduled))
      .toBe("scheduled-generation");
    expect(completedPostBackfillRefreshGenerationId(local)).toBe("local-run");
    expect(qualifiesCompletedPostBackfillRefresh({
      ...local,
      checkpoint_after: {
        ...local.checkpoint_after,
        legacy_snapshot_count: undefined,
      },
    }, input)).toBe(false);
    for (const invalidCount of [null, false, ""]) {
      expect(qualifiesCompletedPostBackfillRefresh({
        ...scheduled,
        checkpoint_after: {
          ...scheduled.checkpoint_after,
          v2_signal_count: invalidCount,
        },
      }, input)).toBe(false);
    }
    expect(qualifiesCompletedPostBackfillRefresh({
      ...scheduled,
      checkpoint_after: {
        ...scheduled.checkpoint_after,
        complete_through: "2026-99-99",
      },
    }, input)).toBe(false);
    expect(qualifiesCompletedPostBackfillRefresh({
      ...local,
      checkpoint_after: {
        ...local.checkpoint_after,
        signal_continuation: {
          ...local.checkpoint_after.signal_continuation,
          refreshId: "duplicate-generation",
        },
      },
    }, input)).toBe(false);
    expect(qualifiesCompletedPostBackfillRefresh({
      ...scheduled,
      checkpoint_after: {
        ...scheduled.checkpoint_after,
        backfill_run_id: "different-backfill",
      },
    }, input)).toBe(false);
    expect(qualifiesCompletedPostBackfillRefresh({
      ...scheduled,
      checkpoint_after: {
        ...scheduled.checkpoint_after,
        metric_version: undefined,
      },
    }, input)).toBe(false);
    expect(qualifiesCompletedPostBackfillRefresh({
      ...scheduled,
      completed_at: input.backfillCompletedAt,
    }, input)).toBe(false);
  });
});
