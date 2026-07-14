import { describe, expect, it } from "vitest";
import type { CanonicalSignalDailyRow } from "@/lib/intelligence/signal-metrics-v2";
import { buildSignalSeriesForRange } from "@/lib/intelligence/signal-series-v2";

const supportedDay: CanonicalSignalDailyRow = {
  signalKey: "topic:alpha",
  signalId: "alpha",
  signalKind: "topic",
  signalLabel: "Alpha",
  signalDate: "2026-07-01",
  lensKeys: ["all"],
  eligibleItems: 1,
  supportingItems: 1,
  supportingDocuments: 1,
  uniqueStories: 1,
  mentionCount: 1,
  eligibleTokens: 100,
  independentSourceCount: 1,
  effectiveSourceCount: 1,
  primarySourceCount: 1,
  uniqueActionCount: 0,
  rawReach: 1,
  sourceBalancedReach: 1,
  mentionsPer10k: 100,
  extractionConfidence: 0.9,
  metadata: {
    sourceFamilies: ["source-a"],
    storyIds: ["story-a"],
    actionIds: [],
    documentIds: ["document-a"],
    sourceCounts: { "source-a": 1 },
  },
};

describe("canonical signal chart series", () => {
  it("retains a zero-support day and includes it in the weekly denominator", () => {
    const totals = new Map([
      ["2026-07-01", { items: 1, tokens: 100 }],
      ["2026-07-02", { items: 9, tokens: 900 }],
    ]);
    const daily = buildSignalSeriesForRange({
      rows: [supportedDay],
      totals,
      start: "2026-07-01",
      end: "2026-07-02",
      daily: true,
    });
    expect(daily.map((point) => ({ date: point.date, share: point.shareOfCoverage })))
      .toEqual([
        { date: "2026-07-01", share: 100 },
        { date: "2026-07-02", share: 0 },
      ]);

    const weekly = buildSignalSeriesForRange({
      rows: [supportedDay],
      totals,
      start: "2026-07-01",
      end: "2026-07-02",
      daily: false,
    });
    expect(weekly).toHaveLength(1);
    expect(weekly[0].shareOfCoverage).toBe(10);
  });
});
