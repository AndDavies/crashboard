import { afterEach, describe, expect, it, vi } from "vitest";
import {
  intelligenceAutomaticResearchEnabled,
  completedIntelligenceV2SignalDate,
  intelligenceSignalsV2DataState,
  intelligenceSignalsV2Enabled,
  isCompletedIntelligenceV2BackfillRun,
} from "@/lib/intelligence/v2-readiness";

const originalFlag = process.env.INTELLIGENCE_SIGNALS_V2;
const originalResearchFlag = process.env.INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED;

function queryResult(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of [
    "select", "eq", "in", "order", "limit", "maybeSingle",
  ]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return query;
}

afterEach(() => {
  if (originalFlag === undefined) delete process.env.INTELLIGENCE_SIGNALS_V2;
  else process.env.INTELLIGENCE_SIGNALS_V2 = originalFlag;
  if (originalResearchFlag === undefined) delete process.env.INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED;
  else process.env.INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED = originalResearchFlag;
});

describe("Intelligence v2 activation gate", () => {
  it("requires an explicit feature flag", () => {
    delete process.env.INTELLIGENCE_SIGNALS_V2;
    expect(intelligenceSignalsV2Enabled()).toBe(false);
    process.env.INTELLIGENCE_SIGNALS_V2 = "true";
    expect(intelligenceSignalsV2Enabled()).toBe(true);
  });

  it("requires a separate explicit feature flag for automatic research", () => {
    delete process.env.INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED;
    expect(intelligenceAutomaticResearchEnabled()).toBe(false);
    process.env.INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED = "true";
    expect(intelligenceAutomaticResearchEnabled()).toBe(true);
  });

  it("accepts only a completed run at the final v2 checkpoint", () => {
    expect(isCompletedIntelligenceV2BackfillRun({
      status: "completed",
      checkpoint_after: { job: "intelligence_v2", phase: "complete" },
    })).toBe(true);
    expect(isCompletedIntelligenceV2BackfillRun({
      status: "running",
      checkpoint_after: { job: "intelligence_v2", phase: "signals" },
    })).toBe(false);
    expect(isCompletedIntelligenceV2BackfillRun({
      status: "completed",
      checkpoint_after: { job: "legacy_backfill", phase: "complete" },
    })).toBe(false);
  });

  it("reads complete dates only from completed current-metric writers", () => {
    expect(completedIntelligenceV2SignalDate({
      run_type: "signal_refresh",
      status: "completed",
      checkpoint_after: {
        metric_version: "signals-v2.1.0",
        complete_through: "2026-07-13",
      },
    })).toBe("2026-07-13");
    expect(completedIntelligenceV2SignalDate({
      run_type: "signal_refresh",
      status: "partial",
      checkpoint_after: { complete_through: "2026-07-14" },
    })).toBeNull();
    expect(completedIntelligenceV2SignalDate({
      run_type: "backfill",
      status: "completed",
      checkpoint_after: {
        job: "intelligence_v2",
        phase: "signals",
        signal_complete_through: "2026-07-13",
      },
    })).toBeNull();
  });

  it("serves the latest completed day as explicitly stale while today's writer catches up", async () => {
    process.env.INTELLIGENCE_SIGNALS_V2 = "true";
    const completedBackfill = {
      run_type: "backfill",
      status: "completed",
      completed_at: "2026-07-13T09:00:00.000Z",
      checkpoint_after: {
        job: "intelligence_v2",
        phase: "complete",
        metric_version: "signals-v2.1.0",
        signal_complete_through: "2026-07-12",
      },
    };
    const from = vi.fn()
      .mockReturnValueOnce(queryResult({ data: [completedBackfill], error: null }))
      .mockReturnValueOnce(queryResult({
        data: { refresh_id: "completed-refresh" },
        error: null,
      }))
      .mockReturnValueOnce(queryResult({
        data: {
          refresh_id: "completed-refresh",
          metric_version: "signals-v2.1.0",
          start_date: "2025-06-13",
          complete_through: "2026-07-12",
          generation_started_at: "2026-07-13T09:00:00.000Z",
          status: "active",
          promote: true,
          signal_count: 599,
          daily_row_count: 22_000,
          activated_at: "2026-07-13T09:30:00.000Z",
          retired_at: null,
        },
        error: null,
      }));

    await expect(intelligenceSignalsV2DataState(
      { from } as never,
      "owner",
      "2026-07-13",
    )).resolves.toEqual({
      status: "stale",
      completeThrough: "2026-07-12",
      expectedCompleteThrough: "2026-07-13",
      refreshId: "completed-refresh",
    });
  });
});
