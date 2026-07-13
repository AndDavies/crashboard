import { describe, expect, it } from "vitest";
import {
  chartActionRows,
  chartBucketForDate,
  evidenceForChartPeriod,
  v2SignalToUi,
} from "./trend-ui-model";
import type { IntelligenceSignalSummary } from "@/lib/intelligence/signals-v2-types";

describe("v2 intelligence UI mapping", () => {
  it("keeps percentage units and translates evidence strength into plain language", () => {
    const signal: IntelligenceSignalSummary = {
      id: "signal-1",
      key: "topic:signal-1",
      kind: "topic",
      label: "Counter-drone systems",
      direction: "rising",
      evidenceStrength: "strong",
      currentReach: 23.9,
      previousReach: 17.2,
      changePoints: 6.7,
      currentItems: 12,
      previousItems: 8,
      stories: 10,
      sources: 5,
      actions: 2,
      momentum: 0.067,
      acceleration: 0.01,
      burst: 0.4,
      persistenceWeeks: 4,
      novelty: 0,
      whyNow: "Coverage expanded after two buying announcements.",
      whyItMatters: "Buyers are moving from interest into spending.",
      whatToWatch: "Watch award dates and deployment milestones.",
      lensKeys: ["defence"],
      series: [{ date: "2026-07-12", shareOfCoverage: 23.9, items: 12, stories: 10, sources: 5, actions: 2, mentionsPer10k: 18 }],
      related: [{ id: "keyword:c-uas", kind: "keyword", label: "C-UAS" }],
      evidence: [{
        id: "research-source-1",
        documentId: "document-1",
        title: "Official programme release",
        passage: "The official release confirms the programme milestone.",
        url: "https://example.gov/official-release",
        publisher: "Official source",
        publishedAt: "2026-07-12T12:00:00.000Z",
        sourceFamily: "example.gov",
        authority: "primary",
        storyId: "story-1",
        whyMatched: "Official evidence",
        isResearch: true,
      }],
      annotations: [],
      researchStatus: "not_started",
      researchCompletedAt: null,
    };

    const result = v2SignalToUi(signal);
    expect(result.currentReach).toBe(23.9);
    expect(result.previousReach).toBe(17.2);
    expect(result.evidenceStrength).toBe("Strong");
    expect(result.series[0]?.reach).toBe(23.9);
    expect(result.evidence[0]?.href).toBe("https://example.gov/official-release");
    expect(result.related).toEqual([
      { id: "keyword:c-uas", kind: "keyword", label: "C-UAS" },
    ]);
  });
});

describe("interactive chart periods", () => {
  const evidence = [
    { id: "a", title: "Day one", date: "2026-07-06T12:00:00Z", source: "A", href: "/a" },
    { id: "b", title: "Day two", date: "2026-07-07T12:00:00Z", source: "B", href: "/b" },
  ];

  it("filters a daily point to one day and a weekly point to seven days", () => {
    expect(evidenceForChartPeriod(evidence, "2026-07-06", "daily").map((item) => item.id)).toEqual(["a"]);
    expect(evidenceForChartPeriod(evidence, "2026-07-06", "weekly").map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("places an announcement on its containing weekly chart bucket", () => {
    expect(chartBucketForDate(
      ["2026-07-01", "2026-07-08", "2026-07-15"],
      "2026-07-12",
    )).toBe("2026-07-08");
    expect(chartBucketForDate(
      ["2026-07-10", "2026-07-11", "2026-07-12"],
      "2026-07-13",
    )).toBeNull();
  });

  it("exposes every chart annotation as an accessible action-table row", () => {
    const signal = {
      id: "system:c-uas",
      label: "C-UAS",
      annotations: [
        { date: "2026-07-10", type: "award", label: "Contract awarded" },
        { date: "2026-07-12", type: "trial_pilot", label: "Being tested" },
      ],
    } as never;
    expect(chartActionRows([signal])).toEqual([
      expect.objectContaining({
        signalLabel: "C-UAS",
        date: "2026-07-12",
        type: "trial_pilot",
        label: "Being tested",
      }),
      expect.objectContaining({
        signalLabel: "C-UAS",
        date: "2026-07-10",
        type: "award",
        label: "Contract awarded",
      }),
    ]);
  });
});
