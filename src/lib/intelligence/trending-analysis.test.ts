import { describe, expect, it } from "vitest";
import { analyzeTrendingTopics } from "@/lib/intelligence/trending-analysis";

function document(id: string, date: string, source: string, conceptIds: string[]) {
  return {
    id,
    title: `Article ${id}`,
    summary_short: null,
    published_at: `${date}T12:00:00.000Z`,
    source_identity_id: source,
    publisher_name: source,
    concepts: conceptIds.map((concept_id) => ({ concept_id, confidence: 0.9 })),
  };
}

describe("analyzeTrendingTopics", () => {
  it("compares equal four-week periods and ranks supported increases", () => {
    const documents = [
      document("current-1", "2026-07-11", "source-a", ["funding-theme"]),
      document("current-2", "2026-07-10", "source-b", ["funding-theme"]),
      document("current-3", "2026-07-09", "source-c", ["funding-theme"]),
      document("current-4", "2026-07-08", "source-d", ["other-theme"]),
      document("previous-1", "2026-06-10", "source-a", ["funding-theme"]),
      document("previous-2", "2026-06-09", "source-b", ["other-theme"]),
      document("previous-3", "2026-06-08", "source-c", ["other-theme"]),
      document("previous-4", "2026-06-07", "source-d", ["other-theme"]),
    ];
    const result = analyzeTrendingTopics({
      completeThrough: "2026-07-11",
      documents,
      concepts: [
        { id: "funding-theme", canonical_label: "Funding", concept_type: "theme" },
        { id: "other-theme", canonical_label: "Other", concept_type: "theme" },
      ],
      events: [{
        id: "event-1",
        title: "Funding announced",
        event_type: "funding_investment",
        announced_at: "2026-07-10T12:00:00.000Z",
        concepts: [{ concept_id: "funding-theme", confidence: 0.9 }],
      }],
    });

    expect(result.currentStart).toBe("2026-06-14");
    expect(result.previousStart).toBe("2026-05-17");
    expect(result.currentDocumentCount).toBe(4);
    expect(result.previousDocumentCount).toBe(4);
    expect(result.rising[0]).toMatchObject({
      label: "Funding",
      currentShare: 75,
      previousShare: 25,
      changePoints: 50,
      sourceCount: 3,
    });
    expect(result.rising[0]?.why).toContain("funding announcements");
    expect(result.rising[0]?.soWhat).toContain("Capital and capacity");
  });

  it("merges duplicate labels across concept types and removes source-concentrated noise", () => {
    const result = analyzeTrendingTopics({
      completeThrough: "2026-07-11",
      documents: [
        document("1", "2026-07-11", "source-a", ["robotics-theme"]),
        document("2", "2026-07-10", "source-b", ["robotics-capability"]),
        document("3", "2026-07-09", "source-c", ["robotics-theme", "robotics-capability"]),
        document("4", "2026-07-08", "source-a", ["single-source"]),
        document("5", "2026-07-07", "source-a", ["single-source"]),
        document("6", "2026-07-06", "source-a", ["single-source"]),
      ],
      concepts: [
        { id: "robotics-theme", canonical_label: "Robotics", concept_type: "theme" },
        { id: "robotics-capability", canonical_label: "robotics", concept_type: "capability" },
        { id: "single-source", canonical_label: "Noise", concept_type: "keyword" },
      ],
      events: [],
    });

    expect(result.topics).toHaveLength(1);
    expect(result.topics[0]).toMatchObject({ label: "Robotics", currentDocuments: 3, sourceCount: 3 });
  });
});
