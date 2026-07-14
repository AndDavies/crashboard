import { describe, expect, it } from "vitest";
import {
  buildNearestNeighbourGraph,
  buildTopicGraphFromEdges,
  classBasedTfidf,
  decodeTopicMaintenanceCursor,
  decideSegmentTopicAssignment,
  decideTopicAssignment,
  fallbackTopicSourceFamily,
  meanEmbedding,
  qualifyingTopicComponents,
  resolveTopicWindowStart,
  selectMeasurementTopicSegments,
  selectCurrentConceptEmbeddingRows,
  TOPIC_DISCOVERY_CURSOR_BASE,
  TOPIC_GRAPH_PAGE_LIMIT,
  TOPIC_ASSIGNMENT_SIMILARITY,
  topicMergeReviewMetadata,
  type TopicGraphNode,
  type TopicTermEvidence,
} from "@/lib/intelligence/topic-maintenance-v2";

describe("segment topic assignment order", () => {
  const concepts = [
    { conceptId: "defence-near", domain: "Defence", embedding: [1, 0] },
    { conceptId: "cyber-nearer", domain: "Cybersecurity", embedding: [0.999, 0.001] },
  ];

  it("uses an exact canonical or alias term before a stronger semantic match", () => {
    const decision = decideSegmentTopicAssignment({
      terms: [
        { normalizedTerm: "C-UAS", displayTerm: "C-UAS", count: 2, salience: 0.8 },
      ],
      exactAliases: new Map([["c uas", "exact-counter-uas"]]),
      segmentDomain: "Defence",
      segmentEmbedding: [1, 0],
      concepts,
    });
    expect(decision).toEqual({
      action: "exact_alias",
      conceptId: "exact-counter-uas",
      similarity: 1,
      matchedTerm: "c uas",
    });
  });

  it("selects only a same-domain concept at the inclusive 0.84 gate", () => {
    const thresholdVector = [
      TOPIC_ASSIGNMENT_SIMILARITY,
      Math.sqrt(1 - TOPIC_ASSIGNMENT_SIMILARITY ** 2),
    ];
    const decision = decideSegmentTopicAssignment({
      terms: [],
      exactAliases: new Map(),
      segmentDomain: "Defence",
      segmentEmbedding: thresholdVector,
      concepts,
    });
    expect(decision.action).toBe("semantic");
    expect(decision.conceptId).toBe("defence-near");
    expect(decision.similarity).toBeCloseTo(TOPIC_ASSIGNMENT_SIMILARITY, 8);
  });

  it("leaves sub-threshold segments for the candidate graph", () => {
    const decision = decideSegmentTopicAssignment({
      terms: [{ normalizedTerm: "novel distributed sensing" }],
      exactAliases: new Map(),
      segmentDomain: "Defence",
      segmentEmbedding: [0.83, Math.sqrt(1 - 0.83 ** 2)],
      concepts,
    });
    expect(decision.action).toBe("unassigned");
    expect(decision.similarity).toBeCloseTo(0.83, 8);
  });
});

describe("topic maintenance assignment guards", () => {
  it("allows only active measurement documents after their activation date", () => {
    const segments = [
      {
        id: "measurement",
        documents: {
          source_identity_id: "identity-measurement",
          published_at: "2026-07-13T09:00:00.000Z",
          metadata: {},
        },
      },
      {
        id: "research",
        documents: {
          source_identity_id: "identity-research",
          published_at: "2026-07-13T09:00:00.000Z",
          metadata: {},
        },
      },
      {
        id: "pre-activation",
        documents: {
          source_identity_id: "identity-promoted",
          published_at: "2026-07-01T09:00:00.000Z",
          metadata: {},
        },
      },
      {
        id: "metadata-research",
        documents: {
          published_at: "2026-07-13T09:00:00.000Z",
          metadata: { source_cohort: "research" },
        },
      },
    ];
    const selected = selectMeasurementTopicSegments({
      segments,
      identities: [
        { id: "identity-measurement", source_id: "source-measurement" },
        { id: "identity-research", source_id: "source-research" },
        { id: "identity-promoted", source_id: "source-promoted" },
      ],
      sources: [
        { id: "source-measurement", status: "active", cohort: "measurement" },
        { id: "source-research", status: "active", cohort: "research" },
        {
          id: "source-promoted",
          status: "active",
          cohort: "measurement",
          measurement_active_from: "2026-07-10T00:00:00.000Z",
        },
      ],
    });

    expect(selected.map((row) => row.id)).toEqual(["measurement"]);
  });

  it("uses only the embedding for each concept's current taxonomy version", () => {
    expect(selectCurrentConceptEmbeddingRows(
      [
        { id: "a", taxonomy_version: "v2" },
        { id: "b", taxonomy_version: "v1" },
      ],
      [
        { concept_id: "a", taxonomy_version: "v1", embedding: [1, 0] },
        { concept_id: "a", taxonomy_version: "v2", embedding: [0, 1] },
        { concept_id: "b", taxonomy_version: "v1", embedding: [1, 1] },
      ],
    ).map((row) => `${row.concept_id}:${row.taxonomy_version}`)).toEqual([
      "a:v2",
      "b:v1",
    ]);
  });

  it("prefers exact aliases and only auto-merges at 0.92 or above", () => {
    const aliases = new Map([["counter uas", "concept-exact"]]);
    expect(decideTopicAssignment({
      normalizedLabel: "counter uas",
      exactAliases: aliases,
      nearest: { conceptId: "other", similarity: 0.99 },
    }).action).toBe("exact_alias");
    expect(decideTopicAssignment({
      normalizedLabel: "autonomous interceptors",
      exactAliases: aliases,
      nearest: { conceptId: "candidate", similarity: 0.91 },
    }).action).toBe("candidate_with_suggestion");
    expect(decideTopicAssignment({
      normalizedLabel: "autonomous interceptors",
      exactAliases: aliases,
      nearest: { conceptId: "candidate", similarity: 0.92 },
    }).action).toBe("auto_merge");
  });

  it("keeps 0.80-0.92 similarities as approval suggestions", () => {
    const aliases = new Map<string, string>();
    expect(decideTopicAssignment({
      normalizedLabel: "distributed maritime sensors",
      exactAliases: aliases,
      nearest: { conceptId: "existing", similarity: 0.7999 },
    }).action).toBe("new_candidate");
    expect(decideTopicAssignment({
      normalizedLabel: "distributed maritime sensors",
      exactAliases: aliases,
      nearest: { conceptId: "existing", similarity: 0.8 },
    }).action).toBe("candidate_with_suggestion");
    expect(decideTopicAssignment({
      normalizedLabel: "distributed maritime sensors",
      exactAliases: aliases,
      nearest: { conceptId: "existing", similarity: 0.9199 },
    }).action).toBe("candidate_with_suggestion");
  });

  it("keeps an explicitly rejected candidate and target pair separate", () => {
    expect(topicMergeReviewMetadata({
      previousMetadata: {
        merge_review_status: "rejected",
        reviewed_suggested_concept_id: "existing",
        rejected_suggested_concept_ids: ["existing"],
      },
      suggestedConceptId: "existing",
      suggestedSimilarity: 0.9,
      approvalSuggested: true,
    })).toMatchObject({
      suggested_concept_id: "existing",
      approval_required: false,
      merge_review_status: "rejected",
      suggestion_suppressed: true,
    });
  });

  it("opens a new review when the same candidate has a different suggested target", () => {
    expect(topicMergeReviewMetadata({
      previousMetadata: {
        merge_review_status: "rejected",
        reviewed_suggested_concept_id: "old-target",
        rejected_suggested_concept_ids: ["old-target"],
      },
      suggestedConceptId: "new-target",
      suggestedSimilarity: 0.86,
      approvalSuggested: true,
    })).toMatchObject({
      suggested_concept_id: "new-target",
      approval_required: true,
      merge_review_status: "pending",
      suggestion_suppressed: false,
      rejected_suggested_concept_ids: ["old-target"],
    });
  });

  it("does not revive an older rejection after a different target was reviewed", () => {
    expect(topicMergeReviewMetadata({
      previousMetadata: {
        merge_review_status: "pending",
        reviewed_suggested_concept_id: "newer-target",
        rejected_suggested_concept_ids: ["older-rejected-target"],
      },
      suggestedConceptId: "older-rejected-target",
      suggestedSimilarity: 0.89,
      approvalSuggested: true,
    })).toMatchObject({
      suggested_concept_id: "older-rejected-target",
      approval_required: false,
      merge_review_status: "rejected",
      suggestion_suppressed: true,
    });
  });
});

describe("stable topic graph", () => {
  function node(id: string, family: string, embedding: number[]): TopicGraphNode {
    return { id, documentId: `doc-${id}`, sourceFamily: family, embedding };
  }

  it("forms bounded semantic components and enforces item/source-family gates", () => {
    const nodes = [
      node("a1", "A", [1, 0, 0]),
      node("a2", "A", [0.99, 0.05, 0]),
      node("a3", "B", [0.98, 0.1, 0]),
      node("a4", "C", [0.97, 0.12, 0]),
      node("a5", "C", [0.96, 0.14, 0]),
      node("b1", "A", [0, 1, 0]),
      node("b2", "B", [0.05, 0.99, 0]),
      node("b3", "C", [0.1, 0.98, 0]),
      node("b4", "C", [0.12, 0.97, 0]),
    ];
    const graph = buildNearestNeighbourGraph(nodes, { similarity: 0.9, neighbours: 3 });
    expect(graph.components.map((component) => component.nodes.length)).toEqual([5, 4]);
    const qualified = qualifyingTopicComponents(graph.components);
    expect(qualified).toHaveLength(1);
    expect(qualified[0].nodes.map((item) => item.id)).toEqual(["a1", "a2", "a3", "a4", "a5"]);
  });

  it("normalizes a component centroid for comparison with persistent concepts", () => {
    const centroid = meanEmbedding([[1, 0], [0.8, 0.2]]);
    expect(Math.hypot(...centroid)).toBeCloseTo(1, 8);
    expect(centroid[0]).toBeGreaterThan(centroid[1]);
  });

  it("joins components across persisted neighbour pages without recomputing all pairs", () => {
    const nodes = [
      node("a1", "A", []),
      node("a2", "A", []),
      node("a3", "B", []),
      node("a4", "C", []),
      node("a5", "C", []),
    ];
    const graph = buildTopicGraphFromEdges(nodes, [
      { left: "a1", right: "a2", similarity: 0.96 },
      { left: "a2", right: "a3", similarity: 0.93 },
      // This edge came from a later anchor page and bridges the boundary.
      { left: "a3", right: "a4", similarity: 0.91 },
      { left: "a4", right: "a5", similarity: 0.95 },
      // Reversed duplicates are normalized to one strongest edge.
      { left: "a5", right: "a4", similarity: 0.94 },
    ]);

    expect(graph.components).toHaveLength(1);
    expect(graph.components[0].nodes.map((item) => item.id)).toEqual([
      "a1", "a2", "a3", "a4", "a5",
    ]);
    expect(graph.edges).toHaveLength(4);
    expect(qualifyingTopicComponents(graph.components)).toHaveLength(1);
  });

  it("encodes assignment and neighbour-discovery offsets in one resumable cursor", () => {
    expect(TOPIC_GRAPH_PAGE_LIMIT).toBe(5);
    expect(decodeTopicMaintenanceCursor(800)).toEqual({
      stage: "assignment",
      offset: 800,
    });
    expect(decodeTopicMaintenanceCursor(TOPIC_DISCOVERY_CURSOR_BASE + 1_200)).toEqual({
      stage: "discovery",
      offset: 1_200,
    });
  });

  it("pins a valid topic window across later resumable pages", () => {
    expect(resolveTopicWindowStart("2026-01-15", 90, Date.UTC(2026, 6, 13)))
      .toBe("2026-01-15");
    expect(resolveTopicWindowStart(undefined, 90, Date.UTC(2026, 6, 13)))
      .toBe("2026-04-14");
    expect(resolveTopicWindowStart("2026-02-30", 90, Date.UTC(2026, 6, 13)))
      .toBe("2026-04-14");
  });

  it("does not treat missing source identities as one family per document", () => {
    expect(fallbackTopicSourceFamily({ publisher_name: "Example Defence News" }))
      .toBe("publisher:example defence news");
    expect(fallbackTopicSourceFamily({ canonical_url: "https://www.example.com/story" }))
      .toBe("domain:example.com");
    expect(fallbackTopicSourceFamily({ original_url: "not a url" }))
      .toBe("unknown source");
    expect(fallbackTopicSourceFamily({})).toBe("unknown source");
  });
});

describe("class-based TF-IDF", () => {
  it("ranks phrases that distinguish one semantic component from another", () => {
    const evidence: TopicTermEvidence[] = [
      { componentId: "air", normalizedTerm: "counter uas", displayTerm: "C-UAS", kind: "phrase", count: 12, titleCount: 2, salience: 0.9 },
      { componentId: "air", normalizedTerm: "defence", displayTerm: "defence", kind: "keyword", count: 5, titleCount: 0, salience: 0.5 },
      { componentId: "cyber", normalizedTerm: "ransomware", displayTerm: "ransomware", kind: "keyword", count: 10, titleCount: 2, salience: 0.9 },
      { componentId: "cyber", normalizedTerm: "defence", displayTerm: "defence", kind: "keyword", count: 5, titleCount: 0, salience: 0.5 },
    ];
    const ranked = classBasedTfidf(evidence);
    expect(ranked.get("air")?.[0].displayTerm).toBe("C-UAS");
    expect(ranked.get("cyber")?.[0].displayTerm).toBe("ransomware");
    expect(ranked.get("air")?.find((term) => term.normalizedTerm === "counter uas")?.score)
      .toBeGreaterThan(ranked.get("air")?.find((term) => term.normalizedTerm === "defence")?.score ?? 0);
  });
});
