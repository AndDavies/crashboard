import { describe, expect, it } from "vitest";
import { pendingTopicMergeSuggestion } from "@/lib/intelligence/topic-merge-reviews";

const candidate = {
  id: "11111111-1111-4111-8111-111111111111",
  canonical_label: "Counter-drone interceptors",
  domain: "Defence",
  description: "A candidate topic discovered from closely related editorial coverage.",
  status: "candidate",
  updated_at: "2026-07-13T12:00:00.000Z",
  metadata: {
    suggested_concept_id: "22222222-2222-4222-8222-222222222222",
    suggested_similarity: 0.88,
    approval_required: true,
    merge_review_status: "pending",
    support_items: 8,
    source_families: 4,
  },
};

const target = {
  id: "22222222-2222-4222-8222-222222222222",
  canonical_label: "Counter-UAS systems",
  status: "active",
};

describe("pending topic merge suggestions", () => {
  it("returns a plain review item inside the manual similarity range", () => {
    expect(pendingTopicMergeSuggestion(candidate, target)).toMatchObject({
      id: candidate.id,
      label: "Counter-drone interceptors",
      targetId: target.id,
      targetLabel: "Counter-UAS systems",
      similarity: 0.88,
      supportItems: 8,
      sourceFamilies: 4,
    });
  });

  it.each([0.7999, 0.92])("excludes similarity %s outside the manual range", (similarity) => {
    expect(pendingTopicMergeSuggestion({
      ...candidate,
      metadata: { ...candidate.metadata, suggested_similarity: similarity },
    }, target)).toBeNull();
  });

  it("excludes rejected, suppressed, or stale-target suggestions", () => {
    expect(pendingTopicMergeSuggestion({
      ...candidate,
      metadata: {
        ...candidate.metadata,
        approval_required: false,
        merge_review_status: "rejected",
      },
    }, target)).toBeNull();
    expect(pendingTopicMergeSuggestion(candidate, {
      ...target,
      id: "33333333-3333-4333-8333-333333333333",
    })).toBeNull();
    expect(pendingTopicMergeSuggestion(candidate, {
      ...target,
      status: "merged",
    })).toBeNull();
  });
});
