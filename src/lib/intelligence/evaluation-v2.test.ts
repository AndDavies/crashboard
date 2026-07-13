import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
  assertPrivateEvaluationPath,
  buildIntelligenceEvaluationReport,
  hasRequiredSearchCategoryCoverage,
  isNewsletterEvaluationSource,
  summarizePerformance,
  type IntelligenceEvaluationWorkspace,
} from "@/lib/intelligence/evaluation-v2";

function workspace(): IntelligenceEvaluationWorkspace {
  return {
    schemaVersion: INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
    generatedAt: "2026-07-13T12:00:00.000Z",
    ownerFingerprint: "private-owner-fingerprint",
    metricVersion: "signals-v2.0.0",
    completeThrough: "2026-07-12",
    instructions: [],
    duplicatePairs: [
      {
        id: "pair-1",
        predictedSameStory: true,
        left: { id: "a", documentId: "a", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        right: { id: "b", documentId: "b", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        sameStory: true,
        reviewerNote: "",
      },
      {
        id: "pair-2",
        predictedSameStory: false,
        left: { id: "c", documentId: "c", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        right: { id: "d", documentId: "d", title: "", excerpt: "", publishedAt: null, sourceUrl: null },
        sameStory: true,
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
      segments: [],
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
      labelStable: true,
      reviewerNote: "",
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
    performance: {
      chart: [{ measuredAt: "2026-07-13T12:00:00.000Z", durationMs: 400, status: 200, resultCount: 5 }],
      search: [{ measuredAt: "2026-07-13T12:00:00.000Z", durationMs: 600, status: 200, resultCount: 10 }],
    },
  };
}

describe("Intelligence v2 evaluation", () => {
  it("calculates retained quality and performance measures", () => {
    const report = buildIntelligenceEvaluationReport(workspace());
    expect(report.metrics.duplicatePrecision.value).toBe(1);
    expect(report.metrics.duplicateRecall.value).toBe(0.5);
    expect(report.metrics.searchRecallAt10.value).toBe(1);
    expect(report.metrics.evidenceLinkCompleteness.value).toBe(1);
    expect(report.metrics.topicLabelStability.value).toBe(1);
    expect(report.gates.chartResponseUnder1500Ms).toBe(true);
    expect(report.readyForApproval).toBe(false);
  });

  it("uses the slowest successful request for the response-time gate", () => {
    expect(summarizePerformance([
      { measuredAt: "now", durationMs: 500, status: 200, resultCount: 1 },
      { measuredAt: "now", durationMs: 1_600, status: 200, resultCount: 1 },
      { measuredAt: "now", durationMs: 1, status: 500, resultCount: 0 },
    ])).toEqual({ samples: 2, medianMs: 500, p95Ms: 1_600, maxMs: 1_600 });
  });

  it("does not pass a fast chart response unless all five requested series are returned", () => {
    const incompleteChart = workspace();
    incompleteChart.performance.chart[0].resultCount = 4;
    const report = buildIntelligenceEvaluationReport(incompleteChart);
    expect(report.metrics.chartPerformance.maxMs).toBe(400);
    expect(report.gates.chartResponseUnder1500Ms).toBe(false);
  });

  it("does not call a topic label stable without a prior generated snapshot", () => {
    const firstSnapshot = workspace();
    firstSnapshot.surges[0].previousLabel = null;
    firstSnapshot.surges[0].labelStable = true;
    const report = buildIntelligenceEvaluationReport(firstSnapshot);
    expect(report.metrics.topicLabelStability.value).toBeNull();
    expect(report.reviewCompletion.surges.value).toBe(0);
  });

  it("does not infer why-now support merely from the presence of an evidence URL", () => {
    const unverifiedEvidence = workspace();
    unverifiedEvidence.surges[0].linkedWhyNowClaimCount = 0;
    const report = buildIntelligenceEvaluationReport(unverifiedEvidence);
    expect(report.metrics.evidenceLinkCompleteness.value).toBe(0);
    expect(report.gates.evidenceLinksComplete).toBe(false);
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

  it("requires every representative search category", () => {
    const baseSearch = workspace().searches[0];
    expect(hasRequiredSearchCategoryCoverage([
      { ...baseSearch, category: "acronym" },
      { ...baseSearch, category: "system" },
      { ...baseSearch, category: "organization" },
      { ...baseSearch, category: "topic" },
      { ...baseSearch, category: "natural_language" },
    ])).toBe(true);
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
