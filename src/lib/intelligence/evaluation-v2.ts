import { createHash } from "node:crypto";
import path from "node:path";

export const INTELLIGENCE_EVALUATION_SCHEMA_VERSION = "intelligence-v2-evaluation.5";
export const INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION = "intelligence-v2-data-quality.1";
export const INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION = "signal-fingerprint-v2.0.0";

export const INTELLIGENCE_EVALUATION_TARGETS = {
  duplicatePairs: 100,
  eventDuplicatePairs: 100,
  segmentationExamples: 50,
  surges: 30,
  eventTopicLinks: 50,
  searches: 20,
} as const;

export const INTELLIGENCE_REQUIRED_VALIDATION_SNAPSHOTS = 7;

export const INTELLIGENCE_EVALUATION_THRESHOLDS = {
  segmentationAcceptance: 0.9,
  eventTopicLinkPrecision: 0.9,
  topicLabelStability: 1,
} as const;

export type DuplicatePairReview = {
  id: string;
  candidateReason: "canonical_url" | "content_hash" | "title_similarity" | "deterministic_control";
  predictedSameStory: boolean;
  left: EvaluationContentReference;
  right: EvaluationContentReference;
  sameStory: boolean | null;
  reviewerNote: string;
};

export type EventDuplicatePairReview = {
  id: string;
  candidateReason: "title_similarity" | "event_context" | "deterministic_control";
  predictedSameEvent: boolean;
  left: EvaluationEventReference;
  right: EvaluationEventReference;
  sameEvent: boolean | null;
  reviewerNote: string;
};

export type EvaluationEventReference = {
  id: string;
  title: string;
  summary: string;
  eventType: string;
  eventDate: string | null;
};

export type VisibleWhyNowReview = {
  id: string;
  signalKey: string;
  signalDate: string;
  whyNow: string;
  evidenceUrls: string[];
  supportedByLinkedEvidence: boolean | null;
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
  sourceText: string;
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
  signalDate: string;
  currentLabel: string;
  previousLabel: string | null;
  predictedDirection: string;
  whyNow: string;
  whyNowClaimCount: number;
  linkedWhyNowClaimCount: number;
  evidenceUrls: string[];
  isRealTrend: boolean | null;
  directionCorrect: boolean | null;
  labelStable: boolean | null;
  reviewerNote: string;
};

export type TopicLabelReview = {
  signalKey: string;
  currentLabel: string;
  previousLabel: string | null;
  labelStable: boolean | null;
};

export type EvaluationRunProvenance = {
  sourceRunId: string;
  signalRefreshId: string;
  sourceRunType: "backfill" | "signal_refresh";
  sourceRunCompletedAt: string;
  startDate: string;
  completeThrough: string;
  metricVersion: string;
  storyGenerationId: string;
  storyDedupeVersion: string;
  eventGenerationId: string;
  eventDedupeVersion: string;
  validationGenerationPruned: boolean;
  signalFingerprintVersion: string;
  signalRowCount: number;
  completeDaySignalCount: number;
  topicLabelCount: number;
  signalSnapshotFingerprint: string;
  topicLabelFingerprint: string;
};

export type EvaluationValidationSnapshot = Pick<
  EvaluationRunProvenance,
  | "sourceRunId"
  | "signalRefreshId"
  | "sourceRunCompletedAt"
  | "startDate"
  | "completeThrough"
  | "metricVersion"
  | "signalFingerprintVersion"
  | "signalRowCount"
  | "completeDaySignalCount"
  | "topicLabelCount"
  | "signalSnapshotFingerprint"
  | "topicLabelFingerprint"
>;

export type IntelligenceDataQualityGateName =
  | "measurementCoverageAtLeast95Percent"
  | "sourceFamiliesComplete"
  | "newsletterParserRebuildComplete"
  | "excludedSegmentsIsolated"
  | "eventLinkCoverageAtLeast90Percent"
  | "noFutureVisibleEvents"
  | "canonicalSeriesValid"
  | "dailyDenominatorsConsistent"
  | "researchCohortIsolated";

export type IntelligenceDataQualitySnapshot = {
  schemaVersion: typeof INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION;
  generatedAt: string;
  provenance: EvaluationRunProvenance;
  measurements: Record<string, number | null>;
  gates: Record<IntelligenceDataQualityGateName, boolean>;
};

export type IntelligenceBenchmarkProvenance = {
  baseUrl: string;
  deploymentCommit: string;
  completeThrough: string;
  startedAt: string;
  completedAt: string;
  reviewFingerprint: string;
  chartRequestCount: number;
  searchRequestCount: number;
};

export function isNewsletterEvaluationSource(value: unknown) {
  return value === "email_newsletter";
}

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
  relevanceReviewed: boolean;
  reviewerNote: string;
};

const REQUIRED_SEARCH_CATEGORIES: SearchReview["category"][] = [
  "acronym",
  "system",
  "organization",
  "topic",
  "natural_language",
];

export function hasRequiredSearchCategoryCoverage(searches: SearchReview[]) {
  const expectedPerCategory = INTELLIGENCE_EVALUATION_TARGETS.searches /
    REQUIRED_SEARCH_CATEGORIES.length;
  return REQUIRED_SEARCH_CATEGORIES.every((category) =>
    searches.filter((item) => item.category === category).length === expectedPerCategory
  );
}

export type PerformanceSample = {
  requestId: string;
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
  reviewFingerprint: string;
  provenance: EvaluationRunProvenance;
  validationSnapshots: EvaluationValidationSnapshot[];
  instructions: string[];
  duplicatePairs: DuplicatePairReview[];
  eventDuplicatePairs: EventDuplicatePairReview[];
  segmentationExamples: SegmentationReview[];
  surges: SurgeReview[];
  topicLabels: TopicLabelReview[];
  eventTopicLinks: EventTopicLinkReview[];
  searches: SearchReview[];
  visibleWhyNowClaims: VisibleWhyNowReview[];
  performance: {
    chart: PerformanceSample[];
    search: PerformanceSample[];
  };
  dataQuality: IntelligenceDataQualitySnapshot | null;
  benchmark: IntelligenceBenchmarkProvenance | null;
};

type ReviewFingerprintInput = Pick<
  IntelligenceEvaluationWorkspace,
  | "duplicatePairs"
  | "eventDuplicatePairs"
  | "segmentationExamples"
  | "surges"
  | "eventTopicLinks"
  | "searches"
  | "provenance"
>;

export function intelligenceEvaluationReviewFingerprint(
  workspace: ReviewFingerprintInput,
) {
  const serialized = JSON.stringify({
    sourceRunId: workspace.provenance.sourceRunId,
    signalSnapshotFingerprint: workspace.provenance.signalSnapshotFingerprint,
    duplicatePairs: workspace.duplicatePairs.map((item) => item.id),
    eventDuplicatePairs: workspace.eventDuplicatePairs.map((item) => item.id),
    segmentationExamples: workspace.segmentationExamples.map((item) => item.id),
    surges: workspace.surges.map((item) => item.id),
    eventTopicLinks: workspace.eventTopicLinks.map((item) => item.id),
    searches: workspace.searches.map((item) => ({
      id: item.id,
      category: item.category,
      query: item.query,
      expectedResultIds: item.expectedResultIds.toSorted(),
      relevanceReviewed: item.relevanceReviewed,
    })),
  });
  return createHash("sha256").update(serialized).digest("hex");
}

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
    eventDuplicatePairs: RateMetric;
    segmentationExamples: RateMetric;
    surges: RateMetric;
    eventTopicLinks: RateMetric;
    searches: RateMetric;
    visibleWhyNowClaims: RateMetric;
  };
  metrics: {
    duplicatePrecision: RateMetric;
    duplicateRecall: RateMetric;
    eventDuplicatePrecision: RateMetric;
    eventDuplicateRecall: RateMetric;
    segmentationAcceptance: RateMetric;
    falseTrendRate: RateMetric;
    eventTopicLinkPrecision: RateMetric;
    searchRecallAt10: RateMetric;
    topicLabelStability: RateMetric;
    evidenceLinkCompleteness: RateMetric;
    sampledWhyNowClaimCompleteness: RateMetric;
    chartPerformance: PerformanceMetric;
    searchPerformance: PerformanceMetric;
    validationSnapshotCount: number;
  };
  gates: {
    duplicatePrecisionAtLeast90Percent: boolean | null;
    duplicateRecallAtLeast80Percent: boolean | null;
    eventDuplicatePrecisionAtLeast90Percent: boolean | null;
    eventDuplicateRecallAtLeast80Percent: boolean | null;
    segmentationAcceptanceAtLeast90Percent: boolean | null;
    eventTopicLinkPrecisionAtLeast90Percent: boolean | null;
    topicLabelStabilityComplete: boolean | null;
    falseTrendRateBelow10Percent: boolean | null;
    searchRecallAt10AtLeast80Percent: boolean | null;
    evidenceLinksComplete: boolean | null;
    sampledWhyNowClaimsComplete: boolean | null;
    chartResponseUnder1500Ms: boolean | null;
    searchResponseUnder1500Ms: boolean | null;
    validationRefreshSeriesComplete: boolean;
    dataQualitySnapshotCurrent: boolean;
    dataQualityGatesPass: boolean;
    benchmarkCurrent: boolean;
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
  const reviewedEventDuplicates = workspace.eventDuplicatePairs.filter(
    (item) => item.sameEvent !== null,
  );
  const eventTruePositives = reviewedEventDuplicates.filter(
    (item) => item.predictedSameEvent && item.sameEvent === true,
  ).length;
  const eventPredictedPositives = reviewedEventDuplicates.filter(
    (item) => item.predictedSameEvent,
  ).length;
  const eventActualPositives = reviewedEventDuplicates.filter(
    (item) => item.sameEvent === true,
  ).length;
  const reviewedSurges = workspace.surges.filter((item) => item.isRealTrend !== null);
  const reviewedLabelStability = workspace.topicLabels.filter(
    (item) => item.previousLabel !== null && item.labelStable !== null,
  );
  const reviewedLinks = workspace.eventTopicLinks.filter((item) => item.correctLink !== null);
  const reviewedSearches = workspace.searches.filter(
    (item) => item.relevanceReviewed && item.expectedResultIds.length > 0 && item.durationMs !== null,
  );
  const searchRecallSum = reviewedSearches.reduce((sum, item) => {
    const retrieved = new Set(item.retrievedResultIds.slice(0, 10));
    const expected = [...new Set(item.expectedResultIds)];
    const hits = expected.filter((id) => retrieved.has(id)).length;
    return sum + hits / expected.length;
  }, 0);
  const visibleWhyNowClaims = workspace.visibleWhyNowClaims ?? [];
  const supportedVisibleWhyNowClaims = visibleWhyNowClaims.filter(
    (item) => item.supportedByLinkedEvidence === true && item.evidenceUrls.length > 0,
  ).length;
  const sampledWhyNowClaimCount = workspace.surges.reduce(
    (sum, item) => sum + Math.max(0, item.whyNowClaimCount),
    0,
  );
  const linkedSampledWhyNowClaimCount = workspace.surges.reduce(
    (sum, item) => sum + (
      item.evidenceUrls.length > 0
        ? Math.min(Math.max(0, item.linkedWhyNowClaimCount), Math.max(0, item.whyNowClaimCount))
        : 0
    ),
    0,
  );
  const chartPerformance = summarizePerformance(workspace.performance.chart);
  const searchPerformance = summarizePerformance(workspace.performance.search);
  const sampleCounts = {
    duplicatePairs: workspace.duplicatePairs.length,
    eventDuplicatePairs: workspace.eventDuplicatePairs.length,
    segmentationExamples: workspace.segmentationExamples.length,
    surges: workspace.surges.length,
    eventTopicLinks: workspace.eventTopicLinks.length,
    searches: workspace.searches.length,
  };
  const sampleTargetsMet = Object.entries(INTELLIGENCE_EVALUATION_TARGETS).every(
    ([key, target]) => sampleCounts[key as keyof typeof sampleCounts] === target,
  ) && hasRequiredSearchCategoryCoverage(workspace.searches);
  const metrics = {
    duplicatePrecision: rate(truePositives, predictedPositives),
    duplicateRecall: rate(truePositives, actualPositives),
    eventDuplicatePrecision: rate(eventTruePositives, eventPredictedPositives),
    eventDuplicateRecall: rate(eventTruePositives, eventActualPositives),
    segmentationAcceptance: rate(
      workspace.segmentationExamples.filter((item) => {
        const predictedEditorialItems = item.segments.filter((segment) =>
          ["editorial", "unknown"].includes(segment.type) && segment.excludedBecause === null
        ).length;
        return item.acceptable === true && item.containsTrendEligibleBoilerplate === false &&
          item.correctEditorialItemCount === predictedEditorialItems;
      }).length,
      workspace.segmentationExamples.filter((item) => item.acceptable !== null).length,
    ),
    falseTrendRate: rate(
      reviewedSurges.filter((item) =>
        item.isRealTrend === false || item.directionCorrect === false
      ).length,
      reviewedSurges.length,
    ),
    eventTopicLinkPrecision: rate(
      reviewedLinks.filter((item) => item.correctLink === true).length,
      reviewedLinks.length,
    ),
    // Recall is averaged per query so natural-language searches with several
    // relevant results do not outweigh acronym or identifier searches.
    searchRecallAt10: rate(searchRecallSum, reviewedSearches.length),
    topicLabelStability: rate(
      reviewedLabelStability.filter((item) => item.labelStable === true).length,
      reviewedLabelStability.length,
    ),
    evidenceLinkCompleteness: rate(
      supportedVisibleWhyNowClaims,
      visibleWhyNowClaims.length,
    ),
    sampledWhyNowClaimCompleteness: rate(
      linkedSampledWhyNowClaimCount,
      sampledWhyNowClaimCount,
    ),
    chartPerformance,
    searchPerformance,
    validationSnapshotCount: workspace.validationSnapshots.length,
  };
  const validationSnapshots = workspace.validationSnapshots;
  const validationRefreshSeriesComplete =
    validationSnapshots.length >= INTELLIGENCE_REQUIRED_VALIDATION_SNAPSHOTS &&
    new Set(validationSnapshots.map((item) => item.sourceRunId)).size ===
      validationSnapshots.length &&
    validationSnapshots.every((item) =>
      item.startDate === workspace.provenance.startDate &&
      item.completeThrough === workspace.provenance.completeThrough &&
      item.metricVersion === workspace.provenance.metricVersion &&
      item.signalFingerprintVersion === INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION &&
      item.signalFingerprintVersion ===
        validationSnapshots[0]?.signalFingerprintVersion &&
      item.signalRowCount > 0 &&
      item.signalRowCount === validationSnapshots[0]?.signalRowCount &&
      item.completeDaySignalCount > 0 &&
      item.completeDaySignalCount === validationSnapshots[0]?.completeDaySignalCount &&
      item.topicLabelCount > 0 &&
      item.topicLabelCount === validationSnapshots[0]?.topicLabelCount &&
      item.signalSnapshotFingerprint ===
        validationSnapshots[0]?.signalSnapshotFingerprint &&
      item.topicLabelFingerprint === validationSnapshots[0]?.topicLabelFingerprint
    );
  const quality = workspace.dataQuality;
  const dataQualitySnapshotCurrent = Boolean(quality &&
    quality.schemaVersion === INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION &&
    quality.provenance.metricVersion === workspace.provenance.metricVersion &&
    quality.provenance.sourceRunId === quality.provenance.signalRefreshId &&
    quality.provenance.signalFingerprintVersion ===
      INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION &&
    quality.provenance.signalRowCount > 0 &&
    quality.provenance.completeDaySignalCount > 0 &&
    quality.provenance.topicLabelCount > 0 &&
    Boolean(quality.provenance.signalSnapshotFingerprint) &&
    Boolean(quality.provenance.topicLabelFingerprint) &&
    quality.provenance.completeThrough >= workspace.provenance.completeThrough);
  const dataQualityGatesPass = Boolean(
    quality && Object.values(quality.gates).every((value) => value === true),
  );
  const benchmark = workspace.benchmark;
  const currentReviewFingerprint = intelligenceEvaluationReviewFingerprint(workspace);
  const benchmarkCurrent = Boolean(benchmark && quality &&
    benchmark.completeThrough === quality.provenance.completeThrough &&
    benchmark.reviewFingerprint === workspace.reviewFingerprint &&
    workspace.reviewFingerprint === currentReviewFingerprint &&
    benchmark.chartRequestCount === 1 &&
    benchmark.searchRequestCount === INTELLIGENCE_EVALUATION_TARGETS.searches &&
    Date.parse(benchmark.completedAt) >= Date.parse(quality.generatedAt));
  const gates = {
    duplicatePrecisionAtLeast90Percent: gate(
      metrics.duplicatePrecision,
      (value) => value >= 0.9,
    ),
    duplicateRecallAtLeast80Percent: gate(metrics.duplicateRecall, (value) => value >= 0.8),
    eventDuplicatePrecisionAtLeast90Percent: gate(
      metrics.eventDuplicatePrecision,
      (value) => value >= 0.9,
    ),
    eventDuplicateRecallAtLeast80Percent: gate(
      metrics.eventDuplicateRecall,
      (value) => value >= 0.8,
    ),
    segmentationAcceptanceAtLeast90Percent: gate(
      metrics.segmentationAcceptance,
      (value) => value >= INTELLIGENCE_EVALUATION_THRESHOLDS.segmentationAcceptance,
    ),
    eventTopicLinkPrecisionAtLeast90Percent: gate(
      metrics.eventTopicLinkPrecision,
      (value) => value >= INTELLIGENCE_EVALUATION_THRESHOLDS.eventTopicLinkPrecision,
    ),
    topicLabelStabilityComplete: metrics.topicLabelStability.value === null
      ? null
      : metrics.topicLabelStability.value >=
          INTELLIGENCE_EVALUATION_THRESHOLDS.topicLabelStability &&
        workspace.topicLabels.length > 0 &&
        reviewedLabelStability.length === workspace.topicLabels.length,
    falseTrendRateBelow10Percent: gate(metrics.falseTrendRate, (value) => value < 0.1),
    searchRecallAt10AtLeast80Percent: gate(
      metrics.searchRecallAt10,
      (value) => value >= 0.8,
    ),
    evidenceLinksComplete: gate(metrics.evidenceLinkCompleteness, (value) => value === 1),
    sampledWhyNowClaimsComplete: gate(
      metrics.sampledWhyNowClaimCompleteness,
      (value) => value === 1,
    ),
    chartResponseUnder1500Ms: chartPerformance.maxMs === null
      ? null
      : chartPerformance.maxMs < 1_500 && workspace.performance.chart.length === 1 &&
        workspace.performance.chart.every(
        (sample) => sample.status >= 200 && sample.status < 400 && sample.resultCount === 5,
      ),
    searchResponseUnder1500Ms: searchPerformance.maxMs === null
      ? null
      : searchPerformance.maxMs < 1_500 &&
        workspace.performance.search.length === INTELLIGENCE_EVALUATION_TARGETS.searches &&
        workspace.performance.search.every((sample) =>
          sample.status >= 200 && sample.status < 400 && sample.resultCount > 0
        ),
    validationRefreshSeriesComplete,
    dataQualitySnapshotCurrent,
    dataQualityGatesPass,
    benchmarkCurrent,
  };
  const completion = {
    duplicatePairs: completedReviewMetric(
      workspace.duplicatePairs,
      (item) => item.sameStory !== null,
    ),
    eventDuplicatePairs: completedReviewMetric(
      workspace.eventDuplicatePairs,
      (item) => item.sameEvent !== null,
    ),
    segmentationExamples: completedReviewMetric(
      workspace.segmentationExamples,
      (item) => item.acceptable !== null &&
        Number.isInteger(item.correctEditorialItemCount) &&
        Number(item.correctEditorialItemCount) >= 0 &&
        item.containsTrendEligibleBoilerplate !== null,
    ),
    surges: completedReviewMetric(
      workspace.surges,
      (item) => item.isRealTrend !== null && item.directionCorrect !== null &&
        item.whyNowClaimCount > 0 &&
        item.linkedWhyNowClaimCount === item.whyNowClaimCount &&
        item.evidenceUrls.length > 0,
    ),
    eventTopicLinks: completedReviewMetric(
      workspace.eventTopicLinks,
      (item) => item.correctLink !== null,
    ),
    searches: completedReviewMetric(
      workspace.searches,
      (item) => item.relevanceReviewed && item.expectedResultIds.length > 0 && item.durationMs !== null,
    ),
    visibleWhyNowClaims: completedReviewMetric(
      visibleWhyNowClaims,
      (item) => item.supportedByLinkedEvidence !== null,
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
