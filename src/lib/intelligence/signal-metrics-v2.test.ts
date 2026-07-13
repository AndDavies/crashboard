import { describe, expect, it } from "vitest";
import {
  buildCanonicalSignalDailyRows,
  dailyTotalsFromRows,
  retainGloballySupportedSignalObservations,
  summarizeCanonicalSignal,
  type SignalMeasurementItem,
  type SignalMeasurementObservation,
} from "@/lib/intelligence/signal-metrics-v2";

function day(value: number) {
  return `2026-06-${String(value).padStart(2, "0")}`;
}

describe("canonical v2 signal metrics", () => {
  it("keeps canonical series only for signals supported by three distinct items", () => {
    const observation = (
      itemId: string,
      signalKey: string,
      signalKind: SignalMeasurementObservation["signalKind"],
    ): SignalMeasurementObservation => ({
      itemId,
      signalKey,
      signalId: signalKey.split(":")[1]!,
      signalKind,
      signalLabel: signalKey,
      mentions: 1,
      extractionConfidence: 0.8,
      lensKeys: ["all"],
    });
    const observations = [
      observation("item-1", "keyword:one", "keyword"),
      observation("item-1", "organization:two", "organization"),
      observation("item-2", "organization:two", "organization"),
      observation("item-1", "system:three", "system"),
      observation("item-1", "system:three", "system"),
      observation("item-2", "system:three", "system"),
      observation("item-3", "system:three", "system"),
    ];

    const retained = retainGloballySupportedSignalObservations(observations);

    expect(retained).toHaveLength(4);
    expect(new Set(retained.map((item) => item.signalKey))).toEqual(
      new Set(["system:three"]),
    );
    expect(new Set(retained.map((item) => item.itemId))).toEqual(
      new Set(["item-1", "item-2", "item-3"]),
    );
  });

  it("counts measurement items once, caps repeated mentions, and balances sources", () => {
    const items: SignalMeasurementItem[] = [
      { id: "a", documentId: "d-a", date: day(1), tokenCount: 100, sourceFamily: "A", authorityTier: "primary", storyId: "s-1" },
      { id: "b", documentId: "d-b", date: day(1), tokenCount: 100, sourceFamily: "A", authorityTier: "specialist", storyId: "s-1" },
      { id: "c", documentId: "d-c", date: day(1), tokenCount: 100, sourceFamily: "B", authorityTier: "specialist", storyId: "s-2" },
      { id: "d", documentId: "d-d", date: day(1), tokenCount: 100, sourceFamily: "C", authorityTier: "specialist", storyId: "s-3" },
    ];
    const observations: SignalMeasurementObservation[] = [
      { itemId: "a", signalKey: "keyword:c-uas", signalId: "c-uas", signalKind: "keyword", signalLabel: "C-UAS", mentions: 9, extractionConfidence: 0.9, lensKeys: ["defence"] },
      { itemId: "a", signalKey: "keyword:c-uas", signalId: "c-uas", signalKind: "keyword", signalLabel: "C-UAS", mentions: 3, extractionConfidence: 0.8, lensKeys: ["defence"], actionIds: ["award-1"] },
      { itemId: "c", signalKey: "keyword:c-uas", signalId: "c-uas", signalKind: "keyword", signalLabel: "C-UAS", mentions: 1, extractionConfidence: 0.9, lensKeys: ["defence"] },
    ];
    const [row] = buildCanonicalSignalDailyRows({ items, observations });
    expect(row).toMatchObject({
      supportingItems: 2,
      supportingDocuments: 2,
      uniqueStories: 2,
      mentionCount: 6,
      independentSourceCount: 2,
      primarySourceCount: 1,
      uniqueActionCount: 1,
      rawReach: 0.5,
    });
    expect(row.sourceBalancedReach).toBeCloseTo(0.5, 5);
  });

  it("classifies a supported breakout as new without corpus-volume inflation", () => {
    const items: SignalMeasurementItem[] = [];
    const observations: SignalMeasurementObservation[] = [];
    for (let index = 0; index < 56; index += 1) {
      const date = new Date(Date.UTC(2026, 4, 18 + index)).toISOString().slice(0, 10);
      for (let item = 0; item < 10; item += 1) {
        const id = `${date}-${item}`;
        items.push({
          id,
          documentId: `document-${id}`,
          date,
          tokenCount: 100,
          sourceFamily: `source-${item % 4}`,
          authorityTier: item === 0 ? "primary" : "specialist",
          storyId: `story-${id}`,
        });
      }
      if (index >= 50) {
        const itemId = `${date}-${index % 3}`;
        observations.push({
          itemId,
          signalKey: "topic:prsm",
          signalId: "prsm",
          signalKind: "topic",
          signalLabel: "Precision Strike Missile",
          mentions: 1,
          extractionConfidence: 0.9,
          lensKeys: ["defence"],
        });
      }
    }
    const rows = buildCanonicalSignalDailyRows({ items, observations });
    const summary = summarizeCanonicalSignal({
      rows,
      dailyTotals: new Map(
        [...new Set(items.map((item) => item.date))].map((date) => [date, { items: 10, tokens: 1_000 }]),
      ),
      completeThrough: "2026-07-12",
    });
    expect(summary?.direction).toBe("new");
    expect(summary?.currentItems).toBe(6);
    expect(summary?.previousItems).toBe(0);
    expect(summary?.currentReach).toBeCloseTo(6 / 280, 8);
    expect(dailyTotalsFromRows(rows).size).toBe(6);
  });

  it("does not call persistent but statistically flat coverage Strong evidence", () => {
    const items: SignalMeasurementItem[] = [];
    const observations: SignalMeasurementObservation[] = [];
    for (let index = 0; index < 56; index += 1) {
      const date = new Date(Date.UTC(2026, 4, 18 + index)).toISOString().slice(0, 10);
      for (let item = 0; item < 10; item += 1) {
        const id = `${date}-${item}`;
        items.push({
          id,
          documentId: `document-${id}`,
          date,
          tokenCount: 100,
          sourceFamily: `source-${item % 4}`,
          authorityTier: "specialist",
          storyId: `story-${id}`,
        });
      }
      observations.push({
        itemId: `${date}-${index % 4}`,
        signalKey: "topic:flat",
        signalId: "flat",
        signalKind: "topic",
        signalLabel: "Flat persistent topic",
        mentions: 1,
        extractionConfidence: 0.9,
        lensKeys: ["defence"],
      });
    }
    const rows = buildCanonicalSignalDailyRows({ items, observations });
    const summary = summarizeCanonicalSignal({
      rows,
      dailyTotals: new Map(
        [...new Set(items.map((item) => item.date))].map((date) => [date, { items: 10, tokens: 1_000 }]),
      ),
      completeThrough: "2026-07-12",
    });

    expect(summary?.persistence).toBe(4);
    expect(summary?.increaseProbability).toBeCloseTo(0.5, 5);
    expect(summary?.evidenceStrength).toBe("moderate");
  });
});
