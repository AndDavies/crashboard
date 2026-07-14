import { describe, expect, it, vi } from "vitest";
import {
  beginIntelligenceSignalGeneration,
  completeIntelligenceSignalGeneration,
  parseIntelligenceEvaluationSignalSnapshot,
  parseIntelligenceSignalGeneration,
  pruneIntelligenceSignalGeneration,
} from "@/lib/intelligence/signal-generations-v2";

const row = {
  refresh_id: "refresh-1",
  metric_version: "signals-v2.1.0",
  start_date: "2025-06-14",
  complete_through: "2026-07-13",
  generation_started_at: "2026-07-14T06:00:00.000Z",
  status: "staging",
  promote: true,
  signal_count: 599,
  daily_row_count: 22_000,
  event_dedup_generation_id: "event-generation",
  story_dedup_generation_id: "story-generation",
  activated_at: null,
  retired_at: null,
};

describe("immutable Intelligence signal generations", () => {
  it("parses a complete generation identity", () => {
    expect(parseIntelligenceSignalGeneration(row)).toEqual({
      refreshId: "refresh-1",
      metricVersion: "signals-v2.1.0",
      startDate: "2025-06-14",
      completeThrough: "2026-07-13",
      generationStartedAt: "2026-07-14T06:00:00.000Z",
      status: "staging",
      promote: true,
      signalCount: 599,
      dailyRowCount: 22_000,
      eventDedupGenerationId: "event-generation",
      storyDedupGenerationId: "story-generation",
      activatedAt: null,
      retiredAt: null,
    });
  });

  it("initializes the same immutable identity through the database", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    await expect(beginIntelligenceSignalGeneration({ rpc } as never, {
      ownerId: "owner",
      refreshId: "refresh-1",
      metricVersion: "signals-v2.1.0",
      startDate: "2025-06-14",
      completeThrough: "2026-07-13",
      generationStartedAt: "2026-07-14T06:00:00.000Z",
      promote: true,
    })).resolves.toMatchObject({ refreshId: "refresh-1", status: "staging" });
    expect(rpc).toHaveBeenCalledWith("begin_intelligence_signal_generation", {
      query_owner: "owner",
      query_refresh_id: "refresh-1",
      query_metric_version: "signals-v2.1.0",
      query_start: "2025-06-14",
      query_end: "2026-07-13",
      query_generation_started_at: "2026-07-14T06:00:00.000Z",
      query_promote: true,
    });
  });

  it("requires canonical completion to atomically become active", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ...row, status: "staging" }, error: null });
    await expect(completeIntelligenceSignalGeneration({ rpc } as never, {
      ownerId: "owner",
      refreshId: "refresh-1",
      metricVersion: "signals-v2.1.0",
      startDate: "2025-06-14",
      completeThrough: "2026-07-13",
      generationStartedAt: "2026-07-14T06:00:00.000Z",
      finalOrdinal: 15_981,
      promote: true,
    })).rejects.toThrow("did not become active atomically");
  });

  it("accepts only complete compact validation fingerprints", () => {
    expect(parseIntelligenceEvaluationSignalSnapshot({
      fingerprintVersion: "signal-fingerprint-v2.0.0",
      signalRowCount: 193_000,
      signalSnapshotFingerprint: "series-sha",
      completeDaySignalCount: 599,
      topicLabelCount: 546,
      topicLabelFingerprint: "labels-sha",
    })).toMatchObject({
      fingerprintVersion: "signal-fingerprint-v2.0.0",
      signalRowCount: 193_000,
      topicLabelCount: 546,
    });
    expect(parseIntelligenceEvaluationSignalSnapshot({
      fingerprintVersion: "signal-fingerprint-v2.0.0",
      signalRowCount: 0,
      signalSnapshotFingerprint: "",
    })).toBeNull();
    expect(parseIntelligenceEvaluationSignalSnapshot({
      fingerprintVersion: "signal-fingerprint-v1",
      signalRowCount: 193_000,
      signalSnapshotFingerprint: "series-sha",
      completeDaySignalCount: 599,
      topicLabelCount: 546,
      topicLabelFingerprint: "labels-sha",
    })).toBeNull();
  });

  it("bounds idempotent validation-generation pruning", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        signal_rows_deleted: 2_500,
        total_rows_deleted: 395,
        generation_deleted: false,
        already_pruned: false,
        has_more: true,
      },
      error: null,
    });
    await expect(pruneIntelligenceSignalGeneration(
      { rpc } as never,
      "owner",
      "refresh-1",
      9_000,
    )).resolves.toMatchObject({
      signalRowsDeleted: 2_500,
      totalRowsDeleted: 395,
      hasMore: true,
    });
    expect(rpc).toHaveBeenCalledWith("prune_intelligence_signal_generation", {
      query_owner: "owner",
      query_refresh_id: "refresh-1",
      query_batch_size: 2_500,
    });
  });
});
