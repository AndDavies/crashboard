import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __testables } from "@/lib/intelligence/signal-refresh-v2";

describe("segment-level signal support", () => {
  it("excludes a clear recurring promo only after three documents from one family", () => {
    const candidate = (id: string, documentId: string, sourceFamily = "Defence newsletter") => ({
      id,
      documentId,
      contentHash: "same-promo-hash",
      sourceFamily,
      title: "DefenseTalks | Sep 22, 2026",
      contentText: "Secure your spot now! Emerging technologies are transforming defence operations.",
    });
    expect(__testables.recurringBoilerplateSegmentIds([
      candidate("one", "document-one"),
      candidate("two", "document-two"),
    ])).toEqual(new Set());
    expect(__testables.recurringBoilerplateSegmentIds([
      candidate("one", "document-one"),
      candidate("two", "document-two"),
      candidate("three", "document-three"),
    ])).toEqual(new Set(["one", "two", "three"]));

    const recurringGenericRegistration = ["four", "five", "six"].map((id) => ({
      ...candidate(id, `document-${id}`),
      contentHash: "same-registration-hash",
      title: "Supplier briefing",
      contentText: "Register now for details about the upcoming supplier briefing.",
    }));
    expect(__testables.recurringBoilerplateSegmentIds(recurringGenericRegistration))
      .toEqual(new Set(["four", "five", "six"]));
  });

  it("preserves recurring editorial system coverage and cross-family evidence", () => {
    const legitimate = ["one", "two", "three"].map((id) => ({
      id,
      documentId: `document-${id}`,
      contentHash: "same-system-story",
      sourceFamily: "Defence newsletter",
      title: "Canada selects F-35 training system",
      contentText: "The programme completed acceptance testing and will enter service this year.",
    }));
    expect(__testables.recurringBoilerplateSegmentIds(legitimate)).toEqual(new Set());

    const promoAcrossFamilies = legitimate.map((row, index) => ({
      ...row,
      contentHash: "same-promo",
      sourceFamily: index === 2 ? "Independent publisher" : row.sourceFamily,
      title: "FedTalks",
      contentText: "Register now! Join senior leaders at the annual conference.",
    }));
    expect(__testables.recurringBoilerplateSegmentIds(promoAcrossFamilies)).toEqual(new Set());
  });

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
