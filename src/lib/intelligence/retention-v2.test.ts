import { describe, expect, it, vi } from "vitest";
import {
  parseIntelligenceV2RetentionResult,
  runIntelligenceSignalGenerationRetention,
  runIntelligenceV2Retention,
} from "@/lib/intelligence/retention-v2";

describe("Intelligence v2 bounded retention", () => {
  it("parses bounded deletion counts without accepting invalid values", () => {
    expect(parseIntelligenceV2RetentionResult({
      batch_size: 2500,
      has_more: true,
      term_rows_deleted: 2500,
      story_clusters_deleted: -10,
      event_memberships_deleted: "42",
    })).toEqual(expect.objectContaining({
      available: true,
      batchSize: 2500,
      hasMore: true,
      termRowsDeleted: 2500,
      storyClustersDeleted: 0,
      eventMembershipsDeleted: 42,
    }));
  });

  it("treats a rolling-deploy missing function as unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    await expect(runIntelligenceV2Retention({ rpc } as never, "owner", 9000))
      .resolves.toEqual(expect.objectContaining({ available: false, batchSize: 0 }));
    expect(rpc).toHaveBeenCalledWith("maintain_intelligence_v2_retention", {
      query_owner: "owner",
      query_batch_size: 2500,
    });
  });

  it("drains multiple bounded generation pages without one unbounded delete", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          signal_rows_deleted: 2_500,
          total_rows_deleted: 395,
          compacted: false,
          has_more: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          signal_rows_deleted: 300,
          total_rows_deleted: 0,
          compacted: true,
          has_more: false,
        },
        error: null,
      });
    await expect(runIntelligenceSignalGenerationRetention(
      { rpc } as never,
      "owner",
      { maxPages: 20 },
    )).resolves.toEqual({
      available: true,
      pages: 2,
      signalRowsDeleted: 2_800,
      totalRowsDeleted: 395,
      compacted: 1,
      hasMore: false,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
