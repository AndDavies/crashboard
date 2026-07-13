import { describe, expect, it } from "vitest";
import {
  MAX_IMMEDIATE_ALERTS_PER_DAY,
  __testables,
  halifaxDayBounds,
  selectImmediateAlertSignals,
  sendImmediateIntelligenceAlerts,
  type ImmediateAlertSignal,
} from "@/lib/intelligence/immediate-alerts";

function signal(
  key: string,
  overrides: Partial<ImmediateAlertSignal> = {},
): ImmediateAlertSignal {
  return {
    signal_key: key,
    signal_kind: "topic",
    signal_id: key,
    signal_label: key,
    direction: "rising",
    evidence_strength: "strong",
    raw_reach: 0.2,
    primary_source_count: 0,
    unique_action_count: 1,
    hidden_rank_score: 0.5,
    metadata: { summary: { current_reach: 0.23, previous_reach: 0.12, actions: 1 } },
    ...overrides,
  };
}

describe("immediate intelligence alerts", () => {
  it("hard-caps deterministic selection at two strong actionable New/Rising signals", () => {
    const selected = selectImmediateAlertSignals([
      signal("third", { hidden_rank_score: 0.7 }),
      signal("first", { hidden_rank_score: 0.9 }),
      signal("second", { hidden_rank_score: 0.8, unique_action_count: 0, primary_source_count: 1 }),
      signal("early", { evidence_strength: "early", hidden_rank_score: 1 }),
      signal("sustained", { direction: "sustained", hidden_rank_score: 1 }),
      signal("unsupported", { unique_action_count: 0, metadata: {}, hidden_rank_score: 1 }),
    ]);

    expect(MAX_IMMEDIATE_ALERTS_PER_DAY).toBe(2);
    expect(selected.map((item) => item.signal_key)).toEqual(["first", "second"]);
  });

  it("subtracts existing claims so paired cron invocations cannot pick extra signals", () => {
    const selected = selectImmediateAlertSignals(
      [signal("first", { hidden_rank_score: 0.9 }), signal("second", { hidden_rank_score: 0.8 })],
      ["first"],
      1,
    );
    expect(selected.map((item) => item.signal_key)).toEqual(["second"]);
  });

  it("uses Halifax calendar boundaries across daylight-saving offsets", () => {
    expect(halifaxDayBounds(new Date("2026-07-13T12:00:00.000Z"))).toEqual({
      dateKey: "2026-07-13",
      start: "2026-07-13T03:00:00.000Z",
      end: "2026-07-14T03:00:00.000Z",
    });
    expect(halifaxDayBounds(new Date("2026-01-13T12:00:00.000Z"))).toEqual({
      dateKey: "2026-01-13",
      start: "2026-01-13T04:00:00.000Z",
      end: "2026-01-14T04:00:00.000Z",
    });
  });

  it("builds plain-language evidence text from canonical period summaries", () => {
    const candidate = signal("C-UAS", { metadata: { summary: { actions: 3, current_reach: 0.239 } } });
    expect(__testables.explanation(candidate)).toContain("3 distinct real-world actions");
    expect(__testables.currentReach(candidate)).toBe(0.239);
  });

  it("uses primary-source support from the current 28-day summary", () => {
    const candidate = signal("primary-backed", {
      primary_source_count: 0,
      unique_action_count: 0,
      metadata: { summary: { actions: 0, primary_sources: 1 } },
    });
    expect(__testables.primarySourceCount(candidate)).toBe(1);
    expect(__testables.qualifies(candidate)).toBe(true);
  });

  it("keeps alerts off until the canonical v2 series is ready", async () => {
    await expect(sendImmediateIntelligenceAlerts(
      {} as never,
      "owner",
      new Date("2026-07-13T12:00:00.000Z"),
      { enabled: true, getDataStatus: async () => "building" },
    )).resolves.toEqual({
      skipped: true,
      reason: "Canonical v2 signals are building; immediate alerts stayed off.",
      sent: 0,
    });
  });
});
