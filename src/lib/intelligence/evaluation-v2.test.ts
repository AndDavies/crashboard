import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
  INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION,
  INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION,
  assertPrivateEvaluationPath,
  buildIntelligenceEvaluationReport,
  hasRequiredSearchCategoryCoverage,
  intelligenceEvaluationReviewFingerprint,
  isNewsletterEvaluationSource,
  summarizePerformance,
  type IntelligenceEvaluationWorkspace,
} from "@/lib/intelligence/evaluation-v2";

function workspace(): IntelligenceEvaluationWorkspace {
  const provenance = {
    sourceRunId: "refresh-1",
    signalRefreshId: "refresh-1",
    sourceRunType: "signal_refresh" as const,
    sourceRunCompletedAt: "2026-07-13T11:00:00.000Z",
    startDate: "2025-06-13",
    completeThrough: "2026-07-12",
    metricVersion: "signals-v2.1.0",
    storyGenerationId: "story-generation-1",
    storyDedupeVersion: "story-dedup-v2.1.0",
    eventGenerationId: "event-generation-1",
    eventDedupeVersion: "event-dedup-v2.2.4",
    validationGenerationPruned: false,
    signalFingerprintVersion: INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION,
    signalRowCount: 100,
    completeDaySignalCount: 20,
    topicLabelCount: 5,
    signalSnapshotFingerprint: "s".repeat(64),
    topicLabelFingerprint: "t".repeat(64),
  };
  const result: IntelligenceEvaluationWorkspace = {
    schemaVersion: INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
    generatedAt: "2026-07-13T12:00:00.000Z",
    ownerFingerprint: "private-owner-fingerprint",
    metricVersion: "signals-v2.1.0",
    completeThrough: "2026-07-12",
    reviewFingerprint: "r".repeat(64),
    provenance,
    validationSnapshots: Array.from({ length: 7 }, (_, index) => ({
      sourceRunId: `refresh-${index + 1}`,
      signalRefreshId: `refresh-${index + 1}`,
      sourceRunCompletedAt: `2026-07-13T1${index}:00:00.000Z`,
      startDate: provenance.startDate,
      completeThrough: provenance.completeThrough,
      metricVersion: provenance.metricVersion,
      signalFingerprintVersion: provenance.signalFingerprintVersion,
      signalRowCount: provenance.signalRowCount,
      completeDaySignalCount: provenance.completeDaySignalCount,
      topicLabelCount: provenance.topicLabelCount,
      signalSnapshotFingerprint: provenance.signalSnapshotFingerprint,
      topicLabelFingerprint: provenance.topicLabelFingerprint,
    })),
    instructions: [],
    duplicatePairs: [
      {
        id: "pair-1",
        candidateReason: "content_hash",
        predictedSameStory: true,
        left: { id: "a", documentId: "a", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        right: { id: "b", documentId: "b", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        sameStory: true,
        reviewerNote: "",
      },
      {
        id: "pair-2",
        candidateReason: "title_similarity",
        predictedSameStory: false,
        left: { id: "c", documentId: "c", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        right: { id: "d", documentId: "d", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        sameStory: true,
        reviewerNote: "",
      },
    ],
    eventDuplicatePairs: [
      {
        id: "event-pair-1",
        candidateReason: "title_similarity",
        predictedSameEvent: true,
        left: { id: "event-a", title: "", summary: "", eventType: "award", eventDate: null },
        right: { id: "event-b", title: "", summary: "", eventType: "award", eventDate: null },
        sameEvent: true,
        reviewerNote: "",
      },
      {
        id: "event-pair-2",
        candidateReason: "event_context",
        predictedSameEvent: false,
        left: { id: "event-c", title: "", summary: "", eventType: "award", eventDate: null },
        right: { id: "event-d", title: "", summary: "", eventType: "award", eventDate: null },
        sameEvent: true,
        reviewerNote: "",
      },
    ],
    segmentationExamples: [{
      id: "segment-1",
      documentId: "doc-1",
      documentTitle: "",
      publishedAt: null,
      sourceText: "Original newsletter text.",
      parserVersion: "v2",
      parserConfidence: 0.8,
      segments: [
        { id: "item-1", type: "editorial", title: "", excerpt: "", excludedBecause: null },
        { id: "item-2", type: "editorial", title: "", excerpt: "", excludedBecause: null },
      ],
      acceptable: true,
      correctEditorialItemCount: 2,
      containsTrendEligibleBoilerplate: false,
      reviewerNote: "",
    }],
    surges: [{
      id: "surge-1",
      signalKey: "topic:1",
      signalId: "1",
      signalKind: "topic",
      signalDate: "2026-07-12",
      currentLabel: "",
      previousLabel: "",
      predictedDirection: "rising",
      whyNow: "",
      whyNowClaimCount: 2,
      linkedWhyNowClaimCount: 2,
      evidenceUrls: ["https://example.test"],
      isRealTrend: true,
      directionCorrect: true,
      labelStable: true,
      reviewerNote: "",
    }],
    topicLabels: [{
      signalKey: "topic:1",
      currentLabel: "Example",
      previousLabel: "Example",
      labelStable: true,
    }],
    eventTopicLinks: [{
      id: "link-1",
      eventId: "event-1",
      eventTitle: "",
      eventSummary: "",
      eventType: "award",
      topicId: "topic-1",
      topicLabel: "",
      extractionConfidence: 0.9,
      correctLink: true,
      reviewerNote: "",
    }],
    searches: [{
      id: "search-1",
      category: "acronym",
      query: "example",
      expectedResultIds: ["topic:1", "document:1"],
      retrievedResultIds: ["topic:1", "document:other", "document:1"],
      durationMs: 120,
      relevanceReviewed: true,
      reviewerNote: "",
    }],
    visibleWhyNowClaims: [{
      id: "visible-1",
      signalKey: "topic:1",
      signalDate: "2026-07-12",
      whyNow: "Coverage increased across independent sources.",
      evidenceUrls: ["https://example.test/evidence"],
      supportedByLinkedEvidence: true,
      reviewerNote: "",
    }],
    performance: {
      chart: [{ requestId: "chart", measuredAt: "2026-07-13T12:00:00.000Z", durationMs: 400, status: 200, resultCount: 5 }],
      search: [{ requestId: "search-1", measuredAt: "2026-07-13T12:00:00.000Z", durationMs: 600, status: 200, resultCount: 10 }],
    },
    dataQuality: {
      schemaVersion: INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION,
      generatedAt: "2026-07-13T11:30:00.000Z",
      provenance,
      measurements: {},
      gates: {
        measurementCoverageAtLeast95Percent: true,
        sourceFamiliesComplete: true,
        newsletterParserRebuildComplete: true,
        excludedSegmentsIsolated: true,
        eventLinkCoverageAtLeast90Percent: true,
        noFutureVisibleEvents: true,
        canonicalSeriesValid: true,
        dailyDenominatorsConsistent: true,
        researchCohortIsolated: true,
      },
    },
    benchmark: {
      baseUrl: "https://example.test",
      deploymentCommit: "commit-1",
      completeThrough: provenance.completeThrough,
      startedAt: "2026-07-13T11:59:00.000Z",
      completedAt: "2026-07-13T12:01:00.000Z",
      reviewFingerprint: "r".repeat(64),
      chartRequestCount: 1,
      searchRequestCount: 20,
    },
  };
  result.reviewFingerprint = intelligenceEvaluationReviewFingerprint(result);
  if (result.benchmark) result.benchmark.reviewFingerprint = result.reviewFingerprint;
  return result;
}

describe("Intelligence v2 evaluation", () => {
  it("calculates retained quality and performance measures", () => {
    const report = buildIntelligenceEvaluationReport(workspace());
    expect(report.metrics.duplicatePrecision.value).toBe(1);
    expect(report.metrics.duplicateRecall.value).toBe(0.5);
    expect(report.metrics.eventDuplicatePrecision.value).toBe(1);
    expect(report.metrics.eventDuplicateRecall.value).toBe(0.5);
    expect(report.metrics.searchRecallAt10.value).toBe(1);
    expect(report.metrics.evidenceLinkCompleteness.value).toBe(1);
    expect(report.metrics.topicLabelStability.value).toBe(1);
    expect(report.gates.segmentationAcceptanceAtLeast90Percent).toBe(true);
    expect(report.gates.eventTopicLinkPrecisionAtLeast90Percent).toBe(true);
    expect(report.gates.topicLabelStabilityComplete).toBe(true);
    expect(report.gates.chartResponseUnder1500Ms).toBe(true);
    expect(report.gates.validationRefreshSeriesComplete).toBe(true);
    expect(report.gates.dataQualitySnapshotCurrent).toBe(true);
    expect(report.gates.dataQualityGatesPass).toBe(true);
    expect(report.gates.benchmarkCurrent).toBe(true);
    expect(report.readyForApproval).toBe(false);
  });

  it("uses the slowest successful request for the response-time gate", () => {
    expect(summarizePerformance([
      { requestId: "one", measuredAt: "now", durationMs: 500, status: 200, resultCount: 1 },
      { requestId: "two", measuredAt: "now", durationMs: 1_600, status: 200, resultCount: 1 },
      { requestId: "three", measuredAt: "now", durationMs: 1, status: 500, resultCount: 0 },
    ])).toEqual({ samples: 2, medianMs: 500, p95Ms: 1_600, maxMs: 1_600 });
  });

  it("does not pass a fast chart response unless all five requested series are returned", () => {
    const incompleteChart = workspace();
    incompleteChart.performance.chart[0].resultCount = 4;
    const report = buildIntelligenceEvaluationReport(incompleteChart);
    expect(report.metrics.chartPerformance.maxMs).toBe(400);
    expect(report.gates.chartResponseUnder1500Ms).toBe(false);
  });

  it("requires every production search request to succeed and return a result", () => {
    const evaluated = workspace();
    evaluated.performance.search = Array.from({ length: 20 }, (_, index) => ({
      requestId: `search-${index + 1}`,
      measuredAt: "2026-07-13T12:00:00.000Z",
      durationMs: 500,
      status: 200,
      resultCount: 10,
    }));
    expect(buildIntelligenceEvaluationReport(evaluated).gates.searchResponseUnder1500Ms)
      .toBe(true);

    evaluated.performance.search[3].status = 500;
    evaluated.performance.search[3].resultCount = 0;
    expect(buildIntelligenceEvaluationReport(evaluated).gates.searchResponseUnder1500Ms)
      .toBe(false);

    evaluated.performance.search[3].status = 200;
    expect(buildIntelligenceEvaluationReport(evaluated).gates.searchResponseUnder1500Ms)
      .toBe(false);
  });

  it("does not call a topic label stable without a prior generated snapshot", () => {
    const firstSnapshot = workspace();
    firstSnapshot.topicLabels[0].previousLabel = null;
    firstSnapshot.topicLabels[0].labelStable = null;
    const report = buildIntelligenceEvaluationReport(firstSnapshot);
    expect(report.metrics.topicLabelStability.value).toBeNull();
    expect(report.gates.topicLabelStabilityComplete).toBeNull();
  });

  it("blocks approval gates when topic labels or event links are wrong", () => {
    const failedQuality = workspace();
    failedQuality.topicLabels[0].labelStable = false;
    failedQuality.eventTopicLinks[0].correctLink = false;
    const report = buildIntelligenceEvaluationReport(failedQuality);
    expect(report.gates.topicLabelStabilityComplete).toBe(false);
    expect(report.gates.eventTopicLinkPrecisionAtLeast90Percent).toBe(false);
  });

  it("requires a prior label for every topic in the stability gate", () => {
    const missingPriorLabel = workspace();
    missingPriorLabel.topicLabels.push({
      signalKey: "topic:2",
      currentLabel: "New topic",
      previousLabel: null,
      labelStable: null,
    });
    const report = buildIntelligenceEvaluationReport(missingPriorLabel);
    expect(report.metrics.topicLabelStability.value).toBe(1);
    expect(report.gates.topicLabelStabilityComplete).toBe(false);
  });

  it("does not infer why-now support merely from the presence of an evidence URL", () => {
    const unverifiedEvidence = workspace();
    unverifiedEvidence.visibleWhyNowClaims[0].supportedByLinkedEvidence = null;
    const report = buildIntelligenceEvaluationReport(unverifiedEvidence);
    expect(report.metrics.evidenceLinkCompleteness.value).toBe(0);
    expect(report.gates.evidenceLinksComplete).toBe(false);
    expect(report.reviewCompletion.visibleWhyNowClaims.value).toBe(0);
  });

  it("requires linked evidence for every visible why-now statement", () => {
    const unsupported = workspace();
    unsupported.visibleWhyNowClaims.push({
      ...unsupported.visibleWhyNowClaims[0],
      id: "visible-2",
      evidenceUrls: [],
      supportedByLinkedEvidence: true,
    });
    const report = buildIntelligenceEvaluationReport(unsupported);
    expect(report.metrics.evidenceLinkCompleteness.value).toBe(0.5);
    expect(report.gates.evidenceLinksComplete).toBe(false);
  });

  it("requires every sampled why-now claim to be linked before the surge review completes", () => {
    const unsupported = workspace();
    unsupported.surges[0].linkedWhyNowClaimCount = 1;
    const report = buildIntelligenceEvaluationReport(unsupported);
    expect(report.metrics.sampledWhyNowClaimCompleteness.value).toBe(0.5);
    expect(report.gates.sampledWhyNowClaimsComplete).toBe(false);
    expect(report.reviewCompletion.surges.value).toBe(0);
  });

  it("recognizes only newsletter documents as segmentation-review candidates", () => {
    expect(isNewsletterEvaluationSource("email_newsletter")).toBe(true);
    expect(isNewsletterEvaluationSource("web_article")).toBe(false);
    expect(isNewsletterEvaluationSource(null)).toBe(false);
  });

  it("requires the reviewed editorial-item count before a segmentation is complete", () => {
    const incompleteCount = workspace();
    incompleteCount.segmentationExamples[0].correctEditorialItemCount = null;
    expect(buildIntelligenceEvaluationReport(incompleteCount).reviewCompletion.segmentationExamples.value)
      .toBe(0);
  });

  it("fails segmentation acceptance when trend-eligible boilerplate remains", () => {
    const boilerplate = workspace();
    boilerplate.segmentationExamples[0].containsTrendEligibleBoilerplate = true;
    const report = buildIntelligenceEvaluationReport(boilerplate);
    expect(report.metrics.segmentationAcceptance.value).toBe(0);
    expect(report.gates.segmentationAcceptanceAtLeast90Percent).toBe(false);
  });

  it("requires every representative search category", () => {
    const baseSearch = workspace().searches[0];
    const balanced = ([
      "acronym",
      "system",
      "organization",
      "topic",
      "natural_language",
    ] as const).flatMap((category) => Array.from({ length: 4 }, (_, index) => ({
      ...baseSearch,
      id: `${category}-${index}`,
      category,
    })));
    expect(hasRequiredSearchCategoryCoverage(balanced)).toBe(true);
    expect(hasRequiredSearchCategoryCoverage([
      { ...baseSearch, category: "topic" },
      { ...baseSearch, category: "natural_language" },
    ])).toBe(false);
  });

  it("calculates search recall at ten as an equal-weight per-query average", () => {
    const searchEvaluation = workspace();
    searchEvaluation.searches = [
      {
        ...searchEvaluation.searches[0],
        id: "single-expected",
        category: "acronym",
        expectedResultIds: ["miss"],
        retrievedResultIds: ["other"],
      },
      {
        ...searchEvaluation.searches[0],
        id: "three-expected",
        category: "natural_language",
        expectedResultIds: ["one", "two", "three"],
        retrievedResultIds: ["one", "two", "three"],
      },
    ];
    expect(buildIntelligenceEvaluationReport(searchEvaluation).metrics.searchRecallAt10.value)
      .toBe(0.5);
  });

  it("does not score generated search expectations before a relevance review", () => {
    const unreviewed = workspace();
    unreviewed.searches[0].relevanceReviewed = false;
    const report = buildIntelligenceEvaluationReport(unreviewed);
    expect(report.metrics.searchRecallAt10.value).toBeNull();
    expect(report.reviewCompletion.searches.value).toBe(0);
  });

  it("fails closed when fixed-window validation fingerprints drift", () => {
    const drifted = workspace();
    drifted.validationSnapshots[6].topicLabelFingerprint = "different";
    expect(buildIntelligenceEvaluationReport(drifted).gates.validationRefreshSeriesComplete)
      .toBe(false);

    drifted.validationSnapshots = drifted.validationSnapshots.slice(0, 6);
    expect(buildIntelligenceEvaluationReport(drifted).gates.validationRefreshSeriesComplete)
      .toBe(false);
  });

  it("fails closed when the full fixed-window signal series changes", () => {
    const drifted = workspace();
    drifted.validationSnapshots[6].signalSnapshotFingerprint = "different";
    expect(buildIntelligenceEvaluationReport(drifted).gates.validationRefreshSeriesComplete)
      .toBe(false);
  });

  it("requires a current passing data-quality snapshot", () => {
    const missing = workspace();
    missing.dataQuality = null;
    const missingReport = buildIntelligenceEvaluationReport(missing);
    expect(missingReport.gates.dataQualitySnapshotCurrent).toBe(false);
    expect(missingReport.gates.dataQualityGatesPass).toBe(false);

    const failed = workspace();
    if (!failed.dataQuality) throw new Error("Expected data-quality fixture.");
    failed.dataQuality.gates.researchCohortIsolated = false;
    expect(buildIntelligenceEvaluationReport(failed).gates.dataQualityGatesPass).toBe(false);

    const stale = workspace();
    if (!stale.dataQuality) throw new Error("Expected data-quality fixture.");
    stale.dataQuality.provenance = {
      ...stale.dataQuality.provenance,
      sourceRunId: "not-the-current-signal-refresh",
    };
    expect(buildIntelligenceEvaluationReport(stale).gates.dataQualitySnapshotCurrent)
      .toBe(false);
  });

  it("invalidates a benchmark when reviews or accepted data change", () => {
    const staleReview = workspace();
    if (!staleReview.benchmark) throw new Error("Expected benchmark fixture.");
    staleReview.benchmark.reviewFingerprint = "stale";
    expect(buildIntelligenceEvaluationReport(staleReview).gates.benchmarkCurrent).toBe(false);

    const staleData = workspace();
    if (!staleData.benchmark || !staleData.dataQuality) {
      throw new Error("Expected benchmark and data-quality fixtures.");
    }
    staleData.benchmark.completedAt = "2026-07-13T11:00:00.000Z";
    expect(buildIntelligenceEvaluationReport(staleData).gates.benchmarkCurrent).toBe(false);

    const editedExpectations = workspace();
    editedExpectations.searches[0].expectedResultIds.push("document:changed-after-benchmark");
    expect(buildIntelligenceEvaluationReport(editedExpectations).gates.benchmarkCurrent)
      .toBe(false);
  });

  it("refuses to write review data outside the ignored private directory", () => {
    expect(assertPrivateEvaluationPath("/repo", ".local/intelligence-evaluation/review.json"))
      .toBe("/repo/.local/intelligence-evaluation/review.json");
    expect(() => assertPrivateEvaluationPath("/repo", "docs/review.json"))
      .toThrow(/must stay under/u);
  });

  it("keeps private review content out of the aggregate report", () => {
    const privateWorkspace = workspace();
    privateWorkspace.surges[0].currentLabel = "PRIVATE PROGRAMME NAME";
    privateWorkspace.searches[0].query = "PRIVATE SEARCH QUERY";
    privateWorkspace.duplicatePairs[0].left.excerpt = "PRIVATE NEWSLETTER TEXT";
    const serialized = JSON.stringify(buildIntelligenceEvaluationReport(privateWorkspace));
    expect(serialized).not.toContain("PRIVATE PROGRAMME NAME");
    expect(serialized).not.toContain("PRIVATE SEARCH QUERY");
    expect(serialized).not.toContain("PRIVATE NEWSLETTER TEXT");
  });
});
