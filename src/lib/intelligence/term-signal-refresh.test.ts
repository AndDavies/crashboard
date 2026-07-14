import { describe, expect, it, vi } from "vitest";
import {
  cloneFinalizedTermSignalSupportBatch,
  completeTermSignalRefresh,
  decodeTermSignalCleanupCursor,
  encodeTermSignalCleanupCursor,
  finalizeTermSignalSupport,
  selectBoundedTermSupportRows,
} from "@/lib/intelligence/term-signal-refresh";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("bounded term signal refresh pages", () => {
  it("requests one bounded clone batch and validates the returned contract", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        source_refresh_id: "source-refresh",
        target_refresh_id: "target-refresh",
        extraction_version: "terms-v2.0.0",
        start_date: "2025-06-14",
        end_date: "2026-07-13",
        phase: "terms",
        complete: false,
        copied_segment_count: 9_731,
        source_segment_count: 9_731,
        copied_term_count: 2_000,
        source_term_count: 100_000,
        source_final_ordinal: 100_000,
        copied_segment_in_batch: 0,
        copied_term_in_batch: 2_000,
      },
      error: null,
    });
    const admin = { rpc } as unknown as SupabaseClient;
    await expect(cloneFinalizedTermSignalSupportBatch(admin, {
      ownerId: "owner",
      sourceRefreshId: "source-refresh",
      targetRefreshId: "target-refresh",
      extractionVersion: "terms-v2.0.0",
      startDate: "2025-06-14",
      endDate: "2026-07-13",
      batchSize: 50_000,
    })).resolves.toMatchObject({
      phase: "terms",
      copiedTermCount: 2_000,
      sourceTermCount: 100_000,
      complete: false,
    });
    expect(rpc).toHaveBeenCalledWith(
      "clone_intelligence_term_signal_support_snapshot",
      expect.objectContaining({ query_batch_size: 2_000 }),
    );
  });

  it("fails closed on RPC errors or a mismatched clone identity", async () => {
    const failed = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "target is non-empty without resumable clone state" },
      }),
    } as unknown as SupabaseClient;
    await expect(cloneFinalizedTermSignalSupportBatch(failed, {
      ownerId: "owner",
      sourceRefreshId: "source-refresh",
      targetRefreshId: "target-refresh",
      extractionVersion: "terms-v2.0.0",
      startDate: "2025-06-14",
      endDate: "2026-07-13",
    })).rejects.toThrow("non-empty without resumable clone state");

    const mismatched = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          source_refresh_id: "different-source",
          target_refresh_id: "target-refresh",
          extraction_version: "terms-v2.0.0",
          start_date: "2025-06-14",
          end_date: "2026-07-13",
          phase: "complete",
          complete: true,
          copied_segment_count: 10,
          source_segment_count: 10,
          copied_term_count: 20,
          source_term_count: 20,
          source_final_ordinal: 20,
          copied_segment_in_batch: 0,
          copied_term_in_batch: 0,
        },
        error: null,
      }),
    } as unknown as SupabaseClient;
    await expect(cloneFinalizedTermSignalSupportBatch(mismatched, {
      ownerId: "owner",
      sourceRefreshId: "source-refresh",
      targetRefreshId: "target-refresh",
      extractionVersion: "terms-v2.0.0",
      startDate: "2025-06-14",
      endDate: "2026-07-13",
    })).rejects.toThrow("mismatched contract");
  });

  it("stops before a page would exceed its observation budget", () => {
    expect(selectBoundedTermSupportRows([
      { ordinal: 1, observationCount: 6_000 },
      { ordinal: 2, observationCount: 8_000 },
      { ordinal: 3, observationCount: 7_000 },
    ], 20_000)).toEqual({
      rows: [
        { ordinal: 1, observationCount: 6_000 },
        { ordinal: 2, observationCount: 8_000 },
      ],
      observationCount: 14_000,
    });
  });

  it("always advances one oversized term so a common term cannot deadlock the cursor", () => {
    expect(selectBoundedTermSupportRows([
      { ordinal: 42, observationCount: 25_000 },
      { ordinal: 43, observationCount: 3 },
    ], 20_000)).toEqual({
      rows: [{ ordinal: 42, observationCount: 25_000 }],
      observationCount: 25_000,
    });
  });

  it("returns an empty page for an exhausted support snapshot", () => {
    expect(selectBoundedTermSupportRows([], 20_000)).toEqual({
      rows: [],
      observationCount: 0,
    });
  });

  it("round-trips the final ordinal through monotonically advancing cleanup pages", () => {
    const first = encodeTermSignalCleanupCursor(16_317, 1);
    const second = encodeTermSignalCleanupCursor(16_317, 2);
    expect(second).toBeGreaterThan(first);
    expect(decodeTermSignalCleanupCursor(second)).toEqual({
      finalOrdinal: 16_317,
      page: 2,
    });
  });

  it("uses a small resumable stale-row cleanup batch by default", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { removed_count: 250, has_more: true },
      error: null,
    });
    await expect(completeTermSignalRefresh(
      { rpc } as unknown as SupabaseClient,
      {
        ownerId: "owner",
        refreshId: "refresh",
        generationStartedAt: "2026-07-14T02:00:00.000Z",
        metricVersion: "signals-v2.1.0",
        startDate: "2025-06-14",
        endDate: "2026-07-13",
        finalOrdinal: 15_981,
      },
    )).resolves.toEqual({ removedCount: 250, hasMore: true });
    expect(rpc).toHaveBeenCalledWith(
      "complete_intelligence_term_signal_refresh",
      expect.objectContaining({ query_batch_size: 250 }),
    );
  });

  it("parses a resumable finalization batch without losing its candidate count", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        stage: "ordinal",
        has_more: true,
        processed_count: 2_000,
        candidate_term_count: 8_000,
      },
      error: null,
    });
    const result = await finalizeTermSignalSupport({ rpc } as unknown as SupabaseClient, {
      ownerId: "owner",
      refreshId: "refresh",
      extractionVersion: "terms-v2",
      startDate: "2025-06-14",
      endDate: "2026-07-13",
    });

    expect(result).toEqual({
      stage: "ordinal",
      hasMore: true,
      processedCount: 2_000,
      candidateTermCount: 8_000,
    });
    expect(rpc).toHaveBeenCalledWith(
      "finalize_intelligence_term_signal_support_v2",
      expect.objectContaining({ query_batch_size: 2_000 }),
    );
  });

  it("caps support accumulation by observation volume as well as segment count", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        processed_segment_count: 73,
        processed_observation_count: 4_921,
        remaining_segment_count: 120,
        total_segment_count: 193,
      },
      error: null,
    });
    const { accumulateTermSignalSupport } = await import(
      "@/lib/intelligence/term-signal-refresh"
    );
    const result = await accumulateTermSignalSupport(
      { rpc } as unknown as SupabaseClient,
      {
        ownerId: "owner",
        refreshId: "refresh",
        extractionVersion: "terms-v2",
        startDate: "2025-06-14",
        endDate: "2026-07-13",
        segmentIds: ["segment"],
        reset: true,
      },
    );

    expect(result).toMatchObject({
      processedSegmentCount: 73,
      processedObservationCount: 4_921,
      remainingSegmentCount: 120,
      totalSegmentCount: 193,
    });
    expect(rpc).toHaveBeenCalledWith(
      "accumulate_intelligence_term_signal_refresh_v2",
      expect.objectContaining({
        query_batch_size: 250,
        query_observation_budget: 2_000,
      }),
    );
  });
});
