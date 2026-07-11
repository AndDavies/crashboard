import { describe, expect, it, vi } from "vitest";
import { runBatchedTrendRefresh } from "@/lib/intelligence/trend-refresh-client";

describe("batched trend refresh", () => {
  it("checkpoints every signal window and rebuilds relationships once", async () => {
    const runBatch = vi.fn(async (body: Record<string, unknown>) => {
      const cursor = Number(body.cursor);
      return {
        snapshotCount: 10 + cursor,
        nextWindowOffset: cursor + 1,
        totalWindowCount: 3,
        hasMore: cursor < 2,
      };
    });
    const onProgress = vi.fn();

    await expect(runBatchedTrendRefresh({
      runBatch,
      onProgress,
      rebuildRelationships: true,
    })).resolves.toEqual({
      complete: 3,
      total: 3,
      snapshotCount: 33,
    });
    expect(runBatch).toHaveBeenCalledTimes(3);
    expect(runBatch.mock.calls[0]?.[0]).toMatchObject({ rebuildRelationships: true });
    expect(runBatch.mock.calls[1]?.[0]).toMatchObject({ rebuildRelationships: false });
    expect(onProgress).toHaveBeenLastCalledWith({ complete: 3, total: 3, snapshotCount: 33 });
  });

  it("skips relationship materialization for routine signal refreshes", async () => {
    const runBatch = vi.fn(async () => ({
      snapshotCount: 3,
      nextWindowOffset: 1,
      totalWindowCount: 1,
      hasMore: false,
    }));

    await runBatchedTrendRefresh({ runBatch });

    expect(runBatch).toHaveBeenCalledWith(expect.objectContaining({ rebuildRelationships: false }));
  });

  it("rejects a batch that cannot advance", async () => {
    await expect(
      runBatchedTrendRefresh({
        runBatch: async () => ({ nextWindowOffset: 0, totalWindowCount: 3, hasMore: true }),
      }),
    ).rejects.toThrow("did not advance");
  });
});
