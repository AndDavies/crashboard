import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { __testables } from "@/lib/intelligence/trends";
import type { SignalWindow } from "@/lib/intelligence/signal-metrics";

describe("replaceSignalSnapshotPeriod", () => {
  const ownerId = "00000000-0000-0000-0000-000000000001";
  const window: SignalWindow = {
    windowType: "operating",
    periodStart: "2026-06-13",
    periodEnd: "2026-07-10",
    baselineStart: "2026-03-21",
    baselineEnd: "2026-06-12",
  };
  const generationStartedAt = "2026-07-10T22:55:00.000Z";

  it("atomically replaces the exact window and channel generation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { applied: true, snapshot_count: 1, stale_deleted_count: 2 },
      error: null,
    });
    const rows = [
      {
        owner_id: ownerId,
        trend_key: "concept:counter-uas",
        period_start: window.periodStart,
        period_end: window.periodEnd,
      },
    ];

    const replaced = await __testables.replaceSignalSnapshotPeriod(
      { rpc } as unknown as SupabaseClient,
      ownerId,
      window,
      "email_newsletter",
      generationStartedAt,
      rows,
    );

    expect(replaced).toEqual({
      applied: true,
      snapshotCount: 1,
      staleDeletedCount: 2,
    });
    expect(rpc).toHaveBeenCalledWith("replace_intelligence_signal_snapshots", {
      p_owner_id: ownerId,
      p_window_type: "operating",
      p_channel: "email_newsletter",
      p_period_start: window.periodStart,
      p_period_end: window.periodEnd,
      p_generation_started_at: generationStartedAt,
      p_rows: rows,
    });
  });

  it("surfaces a failed atomic replacement", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "replacement failed" },
    });

    await expect(
      __testables.replaceSignalSnapshotPeriod(
        { rpc } as unknown as SupabaseClient,
        ownerId,
        window,
        "all",
        generationStartedAt,
        [],
      ),
    ).rejects.toThrow("replacement failed");
  });

  it("rejects a malformed replacement result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { snapshot_count: 2 }, error: null });

    await expect(
      __testables.replaceSignalSnapshotPeriod(
        { rpc } as unknown as SupabaseClient,
        ownerId,
        window,
        "all",
        generationStartedAt,
        [],
      ),
    ).rejects.toThrow("invalid result");
  });
});

describe("window-scoped signal reads", () => {
  it("chunks relationship IDs before paginating their rows", async () => {
    const ids = Array.from({ length: 205 }, (_, index) => `id-${index}`);
    const queryPage = vi.fn(async (idChunk: string[]) => ({
      data: idChunk.map((id) => ({ id })),
      error: null,
    }));

    const rows = await __testables.fetchAllRowsForIds(ids, queryPage);

    expect(rows).toHaveLength(205);
    expect(queryPage.mock.calls.map((call) => call[0].length)).toEqual([100, 100, 5]);
  });

  it("selects resumable historical windows without changing their baseline bounds", () => {
    const windows: SignalWindow[] = [
      { windowType: "pulse", periodStart: "2026-07-04", periodEnd: "2026-07-10", baselineStart: "2026-06-06", baselineEnd: "2026-07-03" },
      { windowType: "operating", periodStart: "2026-06-13", periodEnd: "2026-07-10", baselineStart: "2026-03-21", baselineEnd: "2026-06-12" },
      { windowType: "strategic", periodStart: "2026-04-12", periodEnd: "2026-07-10", baselineStart: "2026-01-12", baselineEnd: "2026-04-11" },
      { windowType: "weekly", periodStart: "2026-01-05", periodEnd: "2026-01-11", baselineStart: "2025-12-08", baselineEnd: "2026-01-04" },
      { windowType: "weekly", periodStart: "2026-01-12", periodEnd: "2026-01-18", baselineStart: "2025-12-15", baselineEnd: "2026-01-11" },
    ];

    const selection = __testables.selectSignalWindows(windows, {
      windowOffset: 3,
      windowLimit: 2,
    });

    expect(selection.windows.map((window) => window.periodStart)).toEqual([
      "2026-01-05",
      "2026-01-12",
    ]);
    expect(__testables.signalWindowDataBounds(selection.windows)).toEqual({
      dataStart: "2025-12-08",
      dataEnd: "2026-01-18",
    });
  });

  it("limits scheduled refreshes to current horizons and the latest completed week", () => {
    const windows: SignalWindow[] = [
      { windowType: "pulse", periodStart: "2026-07-04", periodEnd: "2026-07-10", baselineStart: "2026-06-06", baselineEnd: "2026-07-03" },
      { windowType: "operating", periodStart: "2026-06-13", periodEnd: "2026-07-10", baselineStart: "2026-03-21", baselineEnd: "2026-06-12" },
      { windowType: "strategic", periodStart: "2026-04-12", periodEnd: "2026-07-10", baselineStart: "2026-01-12", baselineEnd: "2026-04-11" },
      { windowType: "weekly", periodStart: "2026-01-05", periodEnd: "2026-01-11", baselineStart: "2025-12-08", baselineEnd: "2026-01-04" },
      { windowType: "weekly", periodStart: "2026-06-29", periodEnd: "2026-07-05", baselineStart: "2026-06-01", baselineEnd: "2026-06-28" },
    ];

    const selection = __testables.selectSignalWindows(windows, { currentWindowsOnly: true });

    expect(selection.windows.map((window) => window.windowType)).toEqual([
      "pulse",
      "operating",
      "strategic",
      "weekly",
    ]);
    expect(selection.windows.at(-1)?.periodStart).toBe("2026-06-29");
  });
});
