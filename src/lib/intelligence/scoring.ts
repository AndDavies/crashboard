import type {
  TrendMetricInput,
  TrendMetricResult,
} from "@/lib/intelligence/types";

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function calculateTrendMetrics(input: TrendMetricInput): TrendMetricResult {
  const current = Math.max(0, finiteOrZero(input.currentEventRate));
  const baseline = Math.max(0, finiteOrZero(input.baselineEventRate));
  const logRatio = Math.log2((current + 0.5) / (baseline + 0.5));
  const momentum = clamp((Math.max(-3, Math.min(3, logRatio)) + 3) / 6);
  const sourceDiversity = clamp(
    Math.log1p(Math.max(0, input.independentSourceCount)) / Math.log(7),
  );
  const persistence = clamp(Math.max(0, input.activeWeeks) / 8);
  const evidenceConfidence = clamp(finiteOrZero(input.evidenceConfidence));

  return {
    momentum,
    sourceDiversity,
    persistence,
    evidenceConfidence,
    trendStrength: Number(
      (
        100 *
        (0.4 * momentum +
          0.25 * sourceDiversity +
          0.2 * persistence +
          0.15 * evidenceConfidence)
      ).toFixed(2),
    ),
  };
}

export function normalizedRate(count: number, documentCount: number) {
  if (!Number.isFinite(count) || !Number.isFinite(documentCount) || documentCount <= 0) {
    return 0;
  }
  return Number(((Math.max(0, count) / documentCount) * 100).toFixed(6));
}
