import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_STORY_DEDUP_VERSION,
  isStoryClusterInGeneration,
  parseStoryMembershipGeneration,
} from "@/lib/intelligence/story-cluster-generations";

const active = {
  generationId: "generation-current",
  dedupeVersion: INTELLIGENCE_STORY_DEDUP_VERSION,
  status: "active" as const,
  storyClusterCount: 12,
  segmentMembershipCount: 15,
  documentMembershipCount: 14,
  reviewClusterCount: 2,
  reviewMembershipCount: 4,
  activatedAt: "2026-07-14T12:00:00.000Z",
};

describe("story cluster generations", () => {
  it("parses the complete generation contract", () => {
    expect(parseStoryMembershipGeneration({
      generation_id: active.generationId,
      dedupe_version: active.dedupeVersion,
      status: active.status,
      expected_story_cluster_count: 12,
      expected_segment_membership_count: 15,
      expected_document_membership_count: 14,
      expected_review_cluster_count: 2,
      expected_review_membership_count: 4,
      activated_at: active.activatedAt,
    })).toEqual(active);
    expect(parseStoryMembershipGeneration({ generation_id: "incomplete" }))
      .toBeNull();
  });

  it("accepts only clusters in the selected generation", () => {
    expect(isStoryClusterInGeneration({
      cluster_type: "story",
      metadata: {
        dedupe_version: INTELLIGENCE_STORY_DEDUP_VERSION,
        story_generation_id: active.generationId,
      },
    }, active)).toBe(true);
    expect(isStoryClusterInGeneration({
      cluster_type: "story",
      metadata: {
        dedupe_version: INTELLIGENCE_STORY_DEDUP_VERSION,
        story_generation_id: "generation-staged",
      },
    }, active)).toBe(false);
  });

  it("keeps only legacy v2 clusters readable before first activation", () => {
    expect(isStoryClusterInGeneration({
      cluster_type: "story",
      metadata: {
        dedupe_version: "story-dedup-v2.0.0",
        measurement_eligible: true,
      },
    }, null)).toBe(true);
    expect(isStoryClusterInGeneration({
      cluster_type: "story",
      metadata: {
        dedupe_version: INTELLIGENCE_STORY_DEDUP_VERSION,
        story_generation_id: "generation-staged",
      },
    }, null)).toBe(false);
  });
});
