import { describe, expect, it } from "vitest";
import {
  analysisPhasePrecedesCheckpoint,
  analysisProcessedCount,
  isIntelligenceAnalysisPhase,
  savedSignalRefreshWindow,
  savedTopicMaintenanceResume,
} from "@/lib/intelligence/analysis-refresh";

describe("resumable Intelligence analysis phases", () => {
  it("accepts only explicit resumable phases", () => {
    expect(isIntelligenceAnalysisPhase("signals")).toBe(true);
    expect(isIntelligenceAnalysisPhase("all")).toBe(false);
    expect(isIntelligenceAnalysisPhase("unknown")).toBe(false);
  });

  it("skips only phases already completed before the saved checkpoint", () => {
    expect(analysisPhasePrecedesCheckpoint("segmentation", "terms")).toBe(true);
    expect(analysisPhasePrecedesCheckpoint("terms", "terms")).toBe(false);
    expect(analysisPhasePrecedesCheckpoint("embeddings", "terms")).toBe(false);
    expect(analysisPhasePrecedesCheckpoint("terms", "unknown")).toBe(false);
  });

  it("reads progress from both top-level and phase-specific results", () => {
    expect(analysisProcessedCount({ scanned: 10 }, "segmentation")).toBe(10);
    expect(analysisProcessedCount({ terms: { processed: 100 } }, "terms")).toBe(100);
    expect(analysisProcessedCount({
      signals: { processedCandidateTermCount: 250 },
    }, "signals")).toBe(250);
    expect(analysisProcessedCount({ terms: { processed: "invalid" } }, "terms")).toBe(0);
  });

  it("restores the fixed signal window from a nested resumable result", () => {
    expect(savedSignalRefreshWindow(
      { signal_history_days: 395 },
      { signals: { completeThrough: "2026-07-12" } },
    )).toEqual({ completeThrough: "2026-07-12", historyDays: 395 });
  });

  it("restores a cutoff pinned before deduplication starts", () => {
    expect(savedSignalRefreshWindow(
      {
        phase: "dedupe",
        signal_complete_through: "2026-07-12",
        signal_history_days: 395,
      },
      null,
    )).toEqual({ completeThrough: "2026-07-12", historyDays: 395 });
  });

  it("accepts the local backfill checkpoint spelling when resuming on the server", () => {
    expect(savedSignalRefreshWindow(
      { completeThrough: "2026-07-11" },
      null,
    )).toEqual({ completeThrough: "2026-07-11", historyDays: 395 });
  });

  it("uses only a matching unfinished server checkpoint for topic continuation", () => {
    expect(savedTopicMaintenanceResume({
      phase: "topic_maintenance",
      hasMore: true,
      nextCursor: 1_000_000_200,
      topic_window_start: "2026-04-14",
    }, null)).toEqual({
      resuming: true,
      cursor: 1_000_000_200,
      windowStart: "2026-04-14",
    });
  });

  it("forces topic maintenance to zero for mismatched or completed state", () => {
    expect(savedTopicMaintenanceResume({
      phase: "embeddings",
      hasMore: true,
      nextCursor: 900,
      topic_window_start: "2026-04-14",
    }, null)).toEqual({ resuming: false, cursor: 0, windowStart: undefined });
    expect(savedTopicMaintenanceResume({
      phase: "topic_maintenance",
      hasMore: false,
      nextCursor: 900,
      topic_window_start: "2026-04-14",
    }, null)).toEqual({ resuming: false, cursor: 0, windowStart: undefined });
  });
});
