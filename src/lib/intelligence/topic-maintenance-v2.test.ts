import { describe, expect, it } from "vitest";
import {
  buildNearestNeighbourGraph,
  classBasedTfidf,
  decideSegmentTopicAssignment,
  decideTopicAssignment,
  meanEmbedding,
  qualifyingTopicComponents,
  TOPIC_ASSIGNMENT_SIMILARITY,
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
