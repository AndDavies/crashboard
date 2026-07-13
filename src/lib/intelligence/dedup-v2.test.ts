import { describe, expect, it } from "vitest";
import { __testables, titleSimilarity } from "@/lib/intelligence/dedup-v2";

describe("story and event deduplication", () => {
  it("recognizes equivalent announcement titles but not unrelated roundups", () => {
    expect(titleSimilarity(
      "Canada awards C-UAS interceptor trial contract",
      "C-UAS interceptor trial contract awarded by Canada",
    )).toBe(1);
    expect(titleSimilarity(
      "Canada awards C-UAS interceptor trial contract",
      "Weekly defence industry roundup",
    )).toBeLessThan(0.3);
  });

  it("prevents a research story from bridging two measurement stories", () => {
    const measurementStories = [
      {
        id: "measurement-a",
        document_id: "document-a",
        story_title: "Alpha Bravo Charlie",
        published_at: "2026-07-10T12:00:00.000Z",
        content_hash: "measurement-a",
        dedup_cohort: "measurement",
      },
      {
        id: "measurement-b",
        document_id: "document-b",
        story_title: "Charlie Delta Echo",
        published_at: "2026-07-10T12:00:00.000Z",
        content_hash: "measurement-b",
        dedup_cohort: "measurement",
      },
    ];
    const bridge = {
      id: "research-bridge",
      document_id: "research-document",
      story_title: "Alpha Bravo Charlie Delta Echo",
      published_at: "2026-07-10T12:00:00.000Z",
      content_hash: "research-bridge",
      dedup_cohort: "non_measurement",
    };
    const vectors = new Map([
      ["measurement-a", [1, 0]],
      ["measurement-b", [0.5, 0.8660254]],
      ["research-bridge", [0.8660254, 0.5]],
    ]);
    const group = (segments: Array<Record<string, unknown>>) =>
      __testables.groupStoryCandidates({
        segments,
        vectors,
        principalsByDocument: new Map(),
        eventTypesByDocument: new Map(),
      }).groups.map((rows) => rows.map((row) => String(row.id)).sort()).sort();

    expect(group([...measurementStories, { ...bridge, dedup_cohort: "measurement" }]))
      .toEqual([["measurement-a", "measurement-b", "research-bridge"]]);
    expect(group([...measurementStories, bridge])).toEqual([
      ["measurement-a"],
      ["measurement-b"],
      ["research-bridge"],
    ]);
  });

  it("deduplicates measurement and research events only within their own cohorts", () => {
    const events = [
      {
        id: "measurement-a",
        title: "Canada awards Counter UAS interceptor contract",
        event_type: "award",
        announced_at: "2026-07-10",
      },
      {
        id: "measurement-b",
        title: "Canada awards Counter UAS interceptor contract",
        event_type: "award",
        announced_at: "2026-07-11",
      },
      {
        id: "research-only",
        title: "Canada awards Counter UAS interceptor contract",
        event_type: "award",
        announced_at: "2026-07-11",
      },
    ];
    const groups = __testables.groupEventCandidates({
      events,
      cohortByEvent: new Map([
        ["measurement-a", "measurement"],
        ["measurement-b", "measurement"],
        ["research-only", "non_measurement"],
      ]),
      principal: () => null,
    }).map((rows) => rows.map((row) => String(row.id)).sort()).sort();

    expect(groups).toEqual([
      ["measurement-a", "measurement-b"],
      ["research-only"],
    ]);
  });

  it("does not let research evidence supply the principal for a measurement event", () => {
    const evidenceByEvent = new Map([
      ["event", [
        { event_id: "event", document_id: "measurement-document" },
        { event_id: "event", document_id: "research-document" },
      ]],
    ]);
    const aligned = __testables.cohortAlignedEvidenceDocumentIds({
      eventId: "event",
      cohortByEvent: new Map([["event", "measurement"]]),
      evidenceByEvent,
      documentCohorts: new Map([
        ["measurement-document", "measurement"],
        ["research-document", "non_measurement"],
      ]),
    });

    expect(aligned).toEqual(["measurement-document"]);
    expect(__testables.principalEntity([
      { id: "measurement-programme", type: "program", role: "subject" },
    ])).toBe("measurement-programme");
    expect(__testables.principalEntity([])).toBeNull();
  });
});
