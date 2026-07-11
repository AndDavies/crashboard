import { describe, expect, it } from "vitest";
import {
  buildSignalWindows,
  calculateSignalMetric,
  latestCompleteDateKey,
  type AttentionSupport,
  type EligibleDocument,
  type EligibleUnit,
  type SignalWindow,
} from "@/lib/intelligence/signal-metrics";

function documents(prefix: string, count: number, dateKey: string): EligibleDocument[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    dateKey,
    source: `source-${index % 5}`,
    channel: "email_newsletter",
  }));
}

function support(rows: EligibleDocument[], count: number): AttentionSupport[] {
  return rows.slice(0, count).map((document) => ({
    id: document.id,
    documentId: document.id,
    dateKey: document.dateKey,
    source: document.source,
    channel: document.channel,
    mentionCount: 1,
    confidence: 0.9,
  }));
}

function units(rows: EligibleDocument[]): EligibleUnit[] {
  return rows.map((document) => ({
    id: document.id,
    documentId: document.id,
    dateKey: document.dateKey,
    source: document.source,
    channel: document.channel,
  }));
}

describe("signal metrics", () => {
  it("anchors every analytical window on the latest complete Halifax day", () => {
    const anchor = new Date("2026-07-11T14:00:00.000Z");
    expect(latestCompleteDateKey(anchor)).toBe("2026-07-10");
    const windows = buildSignalWindows({ earliestDateKey: "2026-01-01", anchor });
    expect(windows.find((window) => window.windowType === "pulse")).toMatchObject({
      periodStart: "2026-07-04",
      periodEnd: "2026-07-10",
      baselineStart: "2026-06-06",
      baselineEnd: "2026-07-03",
    });
    expect(windows.find((window) => window.windowType === "operating")).toMatchObject({
      periodStart: "2026-06-13",
      periodEnd: "2026-07-10",
    });
  });

  it("qualifies broad multi-source growth and exposes transparent denominators", () => {
    const window: SignalWindow = {
      windowType: "operating",
      periodStart: "2026-06-13",
      periodEnd: "2026-07-10",
      baselineStart: "2026-03-21",
      baselineEnd: "2026-06-12",
    };
    const current = documents("current", 100, "2026-07-05");
    const baseline = documents("baseline", 300, "2026-05-01");
    const metric = calculateSignalMetric({
      window,
      attentionUnit: "document",
      currentDocuments: current,
      baselineDocuments: baseline,
      currentUnits: units(current),
      baselineUnits: units(baseline),
      currentAttention: support(current, 30),
      baselineAttention: support(baseline, 15),
      currentActions: [],
      baselineActions: [],
    });

    expect(metric).toMatchObject({
      eligibleDocumentCount: 100,
      supportingDocumentCount: 30,
      mentionRate: 30,
      baselineMentionRate: 5,
      independentSourceCount: 5,
      qualificationStatus: "qualified",
      alertQualified: true,
    });
    expect(metric.confidenceLow).toBeLessThan(0.3);
    expect(metric.confidenceHigh).toBeGreaterThan(0.3);
  });

  it("flags a single-publisher spike instead of calling it a qualified trend", () => {
    const current = documents("current", 100, "2026-07-05");
    const baseline = documents("baseline", 300, "2026-05-01");
    const concentrated = support(current, 15).map((row) => ({ ...row, source: "one-source" }));
    const metric = calculateSignalMetric({
      window: {
        windowType: "operating",
        periodStart: "2026-06-13",
        periodEnd: "2026-07-10",
        baselineStart: "2026-03-21",
        baselineEnd: "2026-06-12",
      },
      attentionUnit: "document",
      currentDocuments: current,
      baselineDocuments: baseline,
      currentUnits: units(current),
      baselineUnits: units(baseline),
      currentAttention: concentrated,
      baselineAttention: support(baseline, 10),
      currentActions: [],
      baselineActions: [],
    });
    expect(metric.qualificationStatus).toBe("insufficient_support");
    expect(metric.alertQualified).toBe(false);
    expect(metric.publisherConcentration).toBe(1);
  });
});
