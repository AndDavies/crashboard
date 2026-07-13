import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __testables } from "@/lib/intelligence/signal-refresh-v2";

describe("segment-level signal support", () => {
  it("matches punctuation-preserving system and acronym labels at token boundaries", () => {
    expect(__testables.segmentSupportsLabel(
      "Canada selected a new C-UAS system alongside the F-35 programme.",
      "C-UAS",
      null,
    )).toBe(true);
    expect(__testables.segmentSupportsLabel(
      "The F-350 truck was mentioned in an unrelated article.",
      "F-35",
      null,
    )).toBe(false);
  });

  it("uses sufficiently grounded evidence but rejects short ambiguous evidence", () => {
    expect(__testables.segmentSupportsLabel(
      "The department awarded the first production contract this week.",
      "Programme Atlas",
      "awarded the first production contract",
    )).toBe(true);
    expect(__testables.segmentSupportsLabel(
      "A different programme received support.",
      "Programme Atlas",
      "support",
    )).toBe(false);
  });

  it("requires event subjects to be supported by measurement evidence documents", () => {
    const measurementDocumentsByEvent = new Map([
      ["event", new Set(["measurement-document"])],
    ]);
    const subjectsByDocument = new Map([
      ["measurement-document", new Set(["measurement-programme"])],
      ["research-document", new Set(["research-programme"])],
    ]);

    expect(__testables.measurementSupportsEventSubject({
      eventId: "event",
      subjectId: "measurement-programme",
      measurementDocumentsByEvent,
      subjectsByDocument,
    })).toBe(true);
    expect(__testables.measurementSupportsEventSubject({
      eventId: "event",
      subjectId: "research-programme",
      measurementDocumentsByEvent,
      subjectsByDocument,
    })).toBe(false);
  });

  it("accepts only measurement-eligible v2 story clusters for scoring", () => {
    expect(__testables.isMeasurementStoryCluster({
      id: "measurement-story",
      cluster_type: "story",
      metadata: {
        dedupe_version: "story-dedup-v2.0.0",
        measurement_eligible: true,
      },
    })).toBe(true);
    expect(__testables.isMeasurementStoryCluster({
      id: "research-story",
      cluster_type: "story",
      metadata: {
        dedupe_version: "story-dedup-v2.0.0",
        measurement_eligible: false,
      },
    })).toBe(false);
    expect(__testables.isMeasurementStoryCluster({
      id: "legacy-duplicate",
      cluster_type: "exact_duplicate",
      metadata: { measurement_eligible: true },
    })).toBe(false);
    expect(__testables.isMeasurementStoryCluster({
      id: "legacy-story",
      cluster_type: "story",
      metadata: { measurement_eligible: true },
    })).toBe(false);
  });
});
