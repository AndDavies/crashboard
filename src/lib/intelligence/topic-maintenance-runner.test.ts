import { describe, expect, it, vi } from "vitest";
import {
  drainTopicMaintenancePages,
  topicMaintenanceCronResume,
} from "@/lib/intelligence/topic-maintenance-runner";

describe("topic maintenance cron runner", () => {
  it("reuses the saved window only for a valid unfinished run", () => {
    expect(topicMaintenanceCronResume({
      status: "partial",
      hasMore: true,
      nextCursor: 800,
      windowStart: "2026-04-14",
    })).toEqual({
      resuming: true,
      cursor: 800,
      windowStart: "2026-04-14",
    });
  });

  it("starts a fresh window after completion or an unusable checkpoint", () => {
    expect(topicMaintenanceCronResume({
      status: "completed",
      hasMore: false,
      nextCursor: null,
      windowStart: "2026-04-14",
    })).toEqual({ resuming: false, cursor: 0, windowStart: undefined });
    expect(topicMaintenanceCronResume({
      status: "partial",
      hasMore: true,
      nextCursor: 800,
      windowStart: "invalid",
    })).toEqual({ resuming: false, cursor: 0, windowStart: undefined });
  });

  it("drains pages and checkpoints each cursor transition", async () => {
    const cursors: number[] = [];
    const checkpoints: Array<{ cursor: number; resumeCursor: number | null }> = [];
    const results = [
      { hasMore: true, nextCursor: 400, stage: "assignment" },
      { hasMore: true, nextCursor: 1_000_000_000, stage: "assignment" },
      { hasMore: false, nextCursor: null, stage: "discovery" },
    ];

    const drained = await drainTopicMaintenancePages({
      deadlineAtMs: 10_000,
      now: () => 0,
      runPage: async (cursor) => {
        cursors.push(cursor);
        return results[cursors.length - 1];
      },
      checkpoint: async ({ cursor, resumeCursor }) => {
        checkpoints.push({ cursor, resumeCursor });
      },
    });

    expect(cursors).toEqual([0, 400, 1_000_000_000]);
    expect(checkpoints).toEqual([
      { cursor: 0, resumeCursor: 400 },
      { cursor: 400, resumeCursor: 1_000_000_000 },
      { cursor: 1_000_000_000, resumeCursor: null },
    ]);
    expect(drained).toMatchObject({ pagesProcessed: 3, complete: true, resumeCursor: null });
  });

  it("returns a durable partial result when the wall-time budget is spent", async () => {
    const checkpoint = vi.fn(async () => undefined);
    const runPage = vi.fn(async () => ({ hasMore: true, nextCursor: 1_000 }));

    const drained = await drainTopicMaintenancePages({
      initialCursor: 600,
      deadlineAtMs: 100,
      now: () => 100,
      runPage,
      checkpoint,
    });

    expect(runPage).toHaveBeenCalledTimes(1);
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({
      cursor: 600,
      resumeCursor: 1_000,
    }));
    expect(drained).toMatchObject({
      pagesProcessed: 1,
      complete: false,
      resumeCursor: 1_000,
    });
  });

  it("allows one committed preparation page without consuming an anchor cursor", async () => {
    const cursors: number[] = [];
    const results = [
      { hasMore: true, nextCursor: 1_000_000_000, allowSameCursor: true },
      { hasMore: false, nextCursor: null },
    ];
    const drained = await drainTopicMaintenancePages({
      initialCursor: 1_000_000_000,
      deadlineAtMs: 1_000,
      now: () => 0,
      runPage: async (cursor) => {
        cursors.push(cursor);
        return results[cursors.length - 1];
      },
      checkpoint: async () => undefined,
    });
    expect(cursors).toEqual([1_000_000_000, 1_000_000_000]);
    expect(drained.complete).toBe(true);
  });

  it("rejects repeated preparation pages at the same cursor", async () => {
    await expect(drainTopicMaintenancePages({
      initialCursor: 1_000_000_000,
      deadlineAtMs: 1_000,
      now: () => 0,
      runPage: async () => ({
        hasMore: true,
        nextCursor: 1_000_000_000,
        allowSameCursor: true,
      }),
      checkpoint: async () => undefined,
    })).rejects.toThrow("did not advance");
  });

  it("rejects a stalled cursor before recording an unusable checkpoint", async () => {
    const checkpoint = vi.fn(async () => undefined);
    await expect(drainTopicMaintenancePages({
      initialCursor: 400,
      deadlineAtMs: 1_000,
      runPage: async () => ({ hasMore: true, nextCursor: 400 }),
      checkpoint,
    })).rejects.toThrow("did not advance");
    expect(checkpoint).not.toHaveBeenCalled();
  });
});
