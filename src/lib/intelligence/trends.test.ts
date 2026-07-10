import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __testables, refreshTrendSnapshots } from "@/lib/intelligence/trends";

describe("replaceTrendSnapshotPeriod", () => {
  const ownerId = "00000000-0000-0000-0000-000000000001";
  const periodStart = "2026-06-27";
  const periodEnd = "2026-07-10";
  const generationStartedAt = "2026-07-10T22:55:00.000Z";

  it("replaces the exact generation through the atomic database RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        applied: true,
        snapshot_count: 1,
        stale_deleted_count: 2,
        generation_started_at: generationStartedAt,
      },
      error: null,
    });
    const rows = [
      {
        owner_id: ownerId,
        trend_key: "theme:current",
        period_start: periodStart,
        period_end: periodEnd,
      },
    ];

    const replaced = await __testables.replaceTrendSnapshotPeriod(
      { rpc } as unknown as SupabaseClient,
      ownerId,
      periodStart,
      periodEnd,
      generationStartedAt,
      rows,
    );

    expect(replaced).toEqual({
      applied: true,
      snapshotCount: 1,
      staleDeletedCount: 2,
      generationStartedAt,
    });
    expect(rpc).toHaveBeenCalledWith("replace_intelligence_trend_snapshots", {
      p_owner_id: ownerId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_generation_started_at: generationStartedAt,
      p_rows: rows,
    });
  });

  it("calls the replacement RPC for an empty recomputation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        applied: true,
        snapshot_count: 0,
        stale_deleted_count: 3,
        generation_started_at: generationStartedAt,
      },
      error: null,
    });

    await __testables.replaceTrendSnapshotPeriod(
      { rpc } as unknown as SupabaseClient,
      ownerId,
      periodStart,
      periodEnd,
      generationStartedAt,
      [],
    );

    expect(rpc).toHaveBeenCalledWith("replace_intelligence_trend_snapshots", {
      p_owner_id: ownerId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_generation_started_at: generationStartedAt,
      p_rows: [],
    });
  });

  it("surfaces a failed atomic replacement", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "replacement failed" },
    });

    await expect(
      __testables.replaceTrendSnapshotPeriod(
        { rpc } as unknown as SupabaseClient,
        ownerId,
        periodStart,
        periodEnd,
        generationStartedAt,
        [],
      ),
    ).rejects.toThrow("replacement failed");
  });

  it("stops before alerts when a newer generation already won", async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      gte: vi.fn(),
      then: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gte.mockReturnValue(query);
    query.then.mockImplementation(
      (
        resolve: (value: { data: unknown[]; error: null }) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    );

    const from = vi.fn((table: string) => {
      if (table !== "intelligence_events" && table !== "documents") {
        throw new Error(`Unexpected post-replacement table access: ${table}`);
      }
      return query;
    });
    const rpc = vi.fn().mockResolvedValue({
      data: {
        applied: false,
        snapshot_count: 7,
        stale_deleted_count: 0,
        generation_started_at: "2026-07-10T23:00:00.000Z",
      },
      error: null,
    });

    const result = await refreshTrendSnapshots(
      { from, rpc } as unknown as SupabaseClient,
      ownerId,
      new Date("2026-07-10T12:00:00.000Z"),
    );

    expect(result).toMatchObject({
      snapshotCount: 7,
      staleDeletedCount: 0,
      superseded: true,
    });
    expect(from).toHaveBeenCalledTimes(2);
  });
});
