import { describe, expect, it } from "vitest";
import {
  assertAllowedLocalReviewMutation,
  blindedLocalReviewItems,
  localReviewProgress,
  mergeLocalReviewDecisions,
  unresolvedLocalReviewItemIds,
} from "@/lib/intelligence/local-review-v2";

function fixture() {
  return {
    schemaVersion: "intelligence-v2-evaluation.5",
    duplicatePairs: [
      {
        id: "story-1",
        evidence: "one",
        left: {
          title: "Left",
          excerpt: "One",
          publishedAt: "2026-01-01",
          sourceUrl: "https://one.test",
        },
        right: {
          title: "Right",
          excerpt: "Two",
          publishedAt: "2026-01-02",
          sourceUrl: "https://two.test",
        },
        sameStory: null,
        reviewerNote: "",
      },
      { id: "story-2", evidence: "two", sameStory: false, reviewerNote: "done" },
      { id: "story-3", evidence: "three", sameStory: null, reviewerNote: "" },
    ],
    eventDuplicatePairs: [
      { id: "event-1", evidence: "one", sameEvent: null, reviewerNote: "" },
    ],
    segmentationExamples: [
      {
        id: "segment-1",
        evidence: "one",
        acceptable: null,
        correctEditorialItemCount: null,
        containsTrendEligibleBoilerplate: null,
        reviewerNote: "",
      },
    ],
    eventTopicLinks: [
      { id: "link-1", evidence: "one", correctLink: null, reviewerNote: "" },
    ],
  };
}

describe("local Intelligence v2 review guard", () => {
  it("selects only unresolved items and reports progress", () => {
    const review = fixture();
    expect(unresolvedLocalReviewItemIds(review, "story-duplicates", 1))
      .toEqual(["story-1"]);
    expect(localReviewProgress(review, "story-duplicates"))
      .toEqual({ total: 3, reviewed: 1, unresolved: 2 });
  });

  it("does not repeatedly send a documented null decision to the local model", () => {
    const review = fixture();
    review.duplicatePairs[0].reviewerNote = "Retained excerpts are insufficient.";
    expect(unresolvedLocalReviewItemIds(review, "story-duplicates", 10))
      .toEqual(["story-3"]);
  });

  it("accepts reviewer-only edits for the selected IDs", () => {
    const before = fixture();
    const after = structuredClone(before);
    after.duplicatePairs[0].sameStory = true;
    after.duplicatePairs[0].reviewerNote = "Same announcement and underlying facts.";
    expect(() => assertAllowedLocalReviewMutation(
      before,
      after,
      "story-duplicates",
      ["story-1"],
    )).not.toThrow();
  });

  it("rejects edits to an unselected item", () => {
    const before = fixture();
    const after = structuredClone(before);
    after.duplicatePairs[0].sameStory = true;
    after.duplicatePairs[2].sameStory = true;
    expect(() => assertAllowedLocalReviewMutation(
      before,
      after,
      "story-duplicates",
      ["story-1"],
    )).toThrow("changed protected evidence");
  });

  it("blinds generated duplicate predictions from the local reviewer", () => {
    const review = fixture();
    Object.assign(review.duplicatePairs[0], {
      candidateReason: "embedding",
      predictedSameStory: true,
    });
    expect(blindedLocalReviewItems(review, "story-duplicates", ["story-1"]))
      .toEqual([{
        id: "story-1",
        left: {
          title: "Left",
          excerpt: "One",
          publishedAt: "2026-01-01",
          sourceUrl: "https://one.test",
        },
        right: {
          title: "Right",
          excerpt: "Two",
          publishedAt: "2026-01-02",
          sourceUrl: "https://two.test",
        },
      }]);
  });

  it("merges one exact allowlisted decision", () => {
    const before = fixture();
    const after = mergeLocalReviewDecisions(
      before,
      "event-duplicates",
      ["event-1"],
      [{ id: "event-1", sameEvent: false, reviewerNote: "Different real-world events." }],
    ) as unknown as ReturnType<typeof fixture>;
    expect(after.eventDuplicatePairs[0]).toMatchObject({
      sameEvent: false,
      reviewerNote: "Different real-world events.",
    });
    expect(before.eventDuplicatePairs[0].sameEvent).toBeNull();
  });

  it("rejects output with an extra field", () => {
    expect(() => mergeLocalReviewDecisions(
      fixture(),
      "event-topic-links",
      ["link-1"],
      [{
        id: "link-1",
        correctLink: true,
        reviewerNote: "",
        extractionConfidence: 1,
      }],
    )).toThrow("missing or extra fields");
  });

  it("rejects edits to retained evidence", () => {
    const before = fixture();
    const after = structuredClone(before);
    after.duplicatePairs[0].sameStory = true;
    after.duplicatePairs[0].evidence = "rewritten";
    expect(() => assertAllowedLocalReviewMutation(
      before,
      after,
      "story-duplicates",
      ["story-1"],
    )).toThrow("changed protected evidence");
  });

  it("rejects invalid segmentation reviewer values", () => {
    const before = fixture();
    const after = structuredClone(before);
    (after.segmentationExamples[0] as {
      correctEditorialItemCount: number | null;
    }).correctEditorialItemCount = -1;
    expect(() => assertAllowedLocalReviewMutation(
      before,
      after,
      "segmentations",
      ["segment-1"],
    )).toThrow("non-negative integer");
  });
});
