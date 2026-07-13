import path from "node:path";

export const INTELLIGENCE_EVALUATION_SCHEMA_VERSION = "intelligence-v2-evaluation.1";

export const INTELLIGENCE_EVALUATION_TARGETS = {
  duplicatePairs: 100,
  segmentationExamples: 50,
  surges: 30,
  eventTopicLinks: 50,
  searches: 20,
} as const;

export type DuplicatePairReview = {
  id: string;
  predictedSameStory: boolean;
  left: EvaluationContentReference;
  right: EvaluationContentReference;
  sameStory: boolean | null;
  reviewerNote: string;
};

export type EvaluationContentReference = {
  id: string;
  documentId: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  sourceUrl: string | null;
};

export type SegmentationReview = {
  id: string;
  documentId: string;
  documentTitle: string;
  publishedAt: string | null;
  parserVersion: string;
  parserConfidence: number;
  segments: Array<{
    id: string;
    type: string;
    title: string;
    excerpt: string;
    excludedBecause: string | null;
  }>;
  acceptable: boolean | null;
  correctEditorialItemCount: number | null;
  containsTrendEligibleBoilerplate: boolean | null;
  reviewerNote: string;
};

export type SurgeReview = {
  id: string;
  signalKey: string;
  signalId: string;
  signalKind: string;
  currentLabel: string;
  previousLabel: string | null;
  predictedDirection: string;
  whyNow: string;
  whyNowClaimCount: number;
  linkedWhyNowClaimCount: number;
  evidenceUrls: string[];
  isRealTrend: boolean | null;
  labelStable: boolean | null;
  reviewerNote: string;
};

export type EventTopicLinkReview = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventSummary: string;
  eventType: string;
  topicId: string;
  topicLabel: string;
  extractionConfidence: number;
  correctLink: boolean | null;
  reviewerNote: string;
};

export type SearchReview = {
  id: string;
  category: "acronym" | "system" | "organization" | "topic" | "natural_language";
  query: string;
  expectedResultIds: string[];
  retrievedResultIds: string[];
  durationMs: number | null;
  reviewerNote: string;
};

export type PerformanceSample = {
  measuredAt: string;
  durationMs: number;
  status: number;
  resultCount: number;
};

export type IntelligenceEvaluationWorkspace = {
  schemaVersion: typeof INTELLIGENCE_EVALUATION_SCHEMA_VERSION;
  generatedAt: string;
  ownerFingerprint: string;
  metricVersion: string;
  completeThrough: string | null;
  instructions: string[];
  duplicatePairs: DuplicatePairReview[];
  segmentationExamples: SegmentationReview[];
  surges: SurgeReview[];
  eventTopicLinks: EventTopicLinkReview[];
  searches: SearchReview[];
  performance: {
    chart: PerformanceSample[];
    search: PerformanceSample[];
  };
};

export type RateMetric = {
  numerator: number;
  denominator: number;
  value: number | null;
};

export type IntelligenceEvaluationReport = {
  schemaVersion: typeof INTELLIGENCE_EVALUATION_SCHEMA_VERSION;
  generatedAt: string;
  sampleCounts: Record<keyof typeof INTELLIGENCE_EVALUATION_TARGETS, number>;
  sampleTargetsMet: boolean;
  reviewCompletion: {
    duplicatePairs: RateMetric;
    segmentationExamples: RateMetric;
    surges: RateMetric;
    eventTopicLinks: RateMetric;
    searches: RateMetric;
  };
  metrics: {
    duplicatePrecision: RateMetric;
    duplicateRecall: RateMetric;
    segmentationAcceptance: RateMetric;
    falseTrendRate: RateMetric;
    eventTopicLinkPrecision: RateMetric;
    searchRecallAt10: RateMetric;
    topicLabelStability: RateMetric;
    evidenceLinkCompleteness: RateMetric;
    chartPerformance: PerformanceMetric;
    searchPerformance: PerformanceMetric;
  };
  gates: {
    duplicatePrecisionAtLeast90Percent: boolean | null;
    duplicateRecallAtLeast80Percent: boolean | null;
    falseTrendRateBelow10Percent: boolean | null;
    searchRecallAt10AtLeast80Percent: boolean | null;
    evidenceLinksComplete: boolean | null;
    chartResponseUnder1500Ms: boolean | null;
    searchResponseUnder1500Ms: boolean | null;
  };
  readyForApproval: boolean;
};

export type PerformanceMetric = {
  samples: number;
  medianMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

function round(value: number, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function rate(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    value: denominator ? round(numerator / denominator) : null,
  };
}

function percentile(sortedValues: number[], quantile: number) {
  if (!sortedValues.length) return null;
  const index = Math.ceil(quantile * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
}

export function summarizePerformance(samples: PerformanceSample[]): PerformanceMetric {
  const values = samples
    .filter((sample) => sample.status >= 200 && sample.status < 400)
    .map((sample) => sample.durationMs)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  return {
    samples: values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: values.at(-1) ?? null,
  };
}

function completedReviewMetric<T>(items: T[], reviewed: (item: T) => boolean) {
  return rate(items.filter(reviewed).length, items.length);
}

function gate(metric: RateMetric, predicate: (value: number) => boolean) {
  return metric.value === null ? null : predicate(metric.value);
}

export function buildIntelligenceEvaluationReport(
  workspace: IntelligenceEvaluationWorkspace,
): IntelligenceEvaluationReport {
  const reviewedDuplicates = workspace.duplicatePairs.filter((item) => item.sameStory !== null);
  const truePositives = reviewedDuplicates.filter(
    (item) => item.predictedSameStory && item.sameStory === true,
  ).length;
  const predictedPositives = reviewedDuplicates.filter((item) => item.predictedSameStory).length;
  const actualPositives = reviewedDuplicates.filter((item) => item.sameStory === true).length;
  const reviewedSurges = workspace.surges.filter((item) => item.isRealTrend !== null);
  const reviewedLabelStability = workspace.surges.filter((item) => item.labelStable !== null);
  const reviewedLinks = workspace.eventTopicLinks.filter((item) => item.correctLink !== null);
  const reviewedSearches = workspace.searches.filter(
    (item) => item.expectedResultIds.length > 0 && item.durationMs !== null,
  );
  const recallHits = reviewedSearches.reduce((sum, item) => {
    const retrieved = new Set(item.retrievedResultIds.slice(0, 10));
    return sum + item.expectedResultIds.filter((id) => retrieved.has(id)).length;
  }, 0);
  const recallExpected = reviewedSearches.reduce(
    (sum, item) => sum + item.expectedResultIds.length,
    0,
  );
  const whyNowClaims = workspace.surges.reduce(
    (sum, item) => sum + Math.max(0, item.whyNowClaimCount),
    0,
  );
  const linkedClaims = workspace.surges.reduce(
    (sum, item) => sum + Math.min(
      Math.max(0, item.whyNowClaimCount),
      Math.max(0, item.linkedWhyNowClaimCount),
    ),
    0,
  );
  const chartPerformance = summarizePerformance(workspace.performance.chart);
  const searchPerformance = summarizePerformance(workspace.performance.search);
  const sampleCounts = {
    duplicatePairs: workspace.duplicatePairs.length,
    segmentationExamples: workspace.segmentationExamples.length,
    surges: workspace.surges.length,
    eventTopicLinks: workspace.eventTopicLinks.length,
    searches: workspace.searches.length,
  };
  const sampleTargetsMet = Object.entries(INTELLIGENCE_EVALUATION_TARGETS).every(
    ([key, target]) => sampleCounts[key as keyof typeof sampleCounts] === target,
  );
  const metrics = {
    duplicatePrecision: rate(truePositives, predictedPositives),
    duplicateRecall: rate(truePositives, actualPositives),
    segmentationAcceptance: rate(
      workspace.segmentationExamples.filter((item) => item.acceptable === true).length,
      workspace.segmentationExamples.filter((item) => item.acceptable !== null).length,
    ),
    falseTrendRate: rate(
      reviewedSurges.filter((item) => item.isRealTrend === false).length,
      reviewedSurges.length,
    ),
    eventTopicLinkPrecision: rate(
      reviewedLinks.filter((item) => item.correctLink === true).length,
      reviewedLinks.length,
    ),
    searchRecallAt10: rate(recallHits, recallExpected),
    topicLabelStability: rate(
      reviewedLabelStability.filter((item) => item.labelStable === true).length,
      reviewedLabelStability.length,
    ),
    evidenceLinkCompleteness: rate(linkedClaims, whyNowClaims),
    chartPerformance,
    searchPerformance,
  };
  const gates = {
    duplicatePrecisionAtLeast90Percent: gate(
      metrics.duplicatePrecision,
      (value) => value >= 0.9,
    ),
    duplicateRecallAtLeast80Percent: gate(metrics.duplicateRecall, (value) => value >= 0.8),
    falseTrendRateBelow10Percent: gate(metrics.falseTrendRate, (value) => value < 0.1),
    searchRecallAt10AtLeast80Percent: gate(
      metrics.searchRecallAt10,
      (value) => value >= 0.8,
    ),
    evidenceLinksComplete: gate(metrics.evidenceLinkCompleteness, (value) => value === 1),
    chartResponseUnder1500Ms: chartPerformance.maxMs === null
      ? null
      : chartPerformance.maxMs < 1_500,
    searchResponseUnder1500Ms: searchPerformance.maxMs === null
      ? null
      : searchPerformance.maxMs < 1_500,
  };
  const completion = {
    duplicatePairs: completedReviewMetric(
      workspace.duplicatePairs,
      (item) => item.sameStory !== null,
    ),
    segmentationExamples: completedReviewMetric(
      workspace.segmentationExamples,
      (item) => item.acceptable !== null && item.containsTrendEligibleBoilerplate !== null,
    ),
    surges: completedReviewMetric(
      workspace.surges,
      (item) => item.isRealTrend !== null && item.labelStable !== null,
    ),
    eventTopicLinks: completedReviewMetric(
      workspace.eventTopicLinks,
      (item) => item.correctLink !== null,
    ),
    searches: completedReviewMetric(
      workspace.searches,
      (item) => item.expectedResultIds.length > 0 && item.durationMs !== null,
    ),
  };
  const allReviewsComplete = Object.values(completion).every((item) => item.value === 1);
  const allGatesPass = Object.values(gates).every((value) => value === true);
  return {
    schemaVersion: INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    sampleCounts,
    sampleTargetsMet,
    reviewCompletion: completion,
    metrics,
    gates,
    readyForApproval: sampleTargetsMet && allReviewsComplete && allGatesPass,
  };
}

export function assertPrivateEvaluationPath(cwd: string, candidate: string) {
  const privateRoot = path.resolve(cwd, ".local/intelligence-evaluation");
  const resolved = path.resolve(cwd, candidate);
  const insidePrivateRoot = resolved === privateRoot || resolved.startsWith(`${privateRoot}${path.sep}`);
  if (!insidePrivateRoot) {
    throw new Error(
      "Evaluation artifacts can contain private source text and must stay under .local/intelligence-evaluation/.",
    );
  }
  return resolved;
}
