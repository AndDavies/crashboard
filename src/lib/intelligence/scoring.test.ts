import { describe, expect, it } from "vitest";
import { calculateTrendMetrics, normalizedRate } from "@/lib/intelligence/scoring";

describe("calculateTrendMetrics", () => {
  it("rewards acceleration, diversity, persistence, and confidence", () => {
    const weak = calculateTrendMetrics({
      currentEventRate: 1,
      baselineEventRate: 1,
      independentSourceCount: 1,
      activeWeeks: 1,
      evidenceConfidence: 0.4,
    });
    const strong = calculateTrendMetrics({
      currentEventRate: 6,
      baselineEventRate: 1,
      independentSourceCount: 6,
      activeWeeks: 8,
      evidenceConfidence: 0.95,
    });

    expect(strong.trendStrength).toBeGreaterThan(weak.trendStrength);
    expect(strong.momentum).toBeGreaterThan(weak.momentum);
  });

  it("keeps every component bounded with hostile inputs", () => {
    const result = calculateTrendMetrics({
      currentEventRate: Number.POSITIVE_INFINITY,
      baselineEventRate: -100,
      independentSourceCount: -2,
      activeWeeks: 100,
      evidenceConfidence: 4,
    });

    expect(result.trendStrength).toBeGreaterThanOrEqual(0);
    expect(result.trendStrength).toBeLessThanOrEqual(100);
    expect(result.persistence).toBe(1);
    expect(result.evidenceConfidence).toBe(1);
  });
});

describe("normalizedRate", () => {
  it("normalizes counts per one hundred documents", () => {
    expect(normalizedRate(25, 500)).toBe(5);
    expect(normalizedRate(25, 0)).toBe(0);
  });
});
