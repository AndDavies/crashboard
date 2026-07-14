import { describe, expect, it } from "vitest";
import { currentSegmentArtifactCoverage } from "@/lib/intelligence/artifact-coverage-v2";

describe("current Intelligence v2 artifact coverage", () => {
  it("does not count stale term states or embeddings for a changed segment", () => {
    expect(currentSegmentArtifactCoverage({
      segments: [
        { id: "current", content_hash: "hash-a" },
        { id: "changed", content_hash: "hash-new" },
      ],
      termStates: [
        { segment_id: "current", content_hash: "hash-a" },
        { segment_id: "changed", content_hash: "hash-old" },
      ],
      segmentEmbeddings: [
        { segment_id: "current", content_hash: "hash-a" },
        { segment_id: "changed", content_hash: "hash-old" },
      ],
    })).toEqual({
      eligibleSegments: 2,
      currentTermCount: 1,
      missingTerms: 1,
      currentEmbeddingCount: 1,
      missingEmbeddings: 1,
    });
  });

  it("counts a zero-observation term state when its content hash is current", () => {
    expect(currentSegmentArtifactCoverage({
      segments: [{ id: "quiet", content_hash: "hash" }],
      termStates: [{ segment_id: "quiet", content_hash: "hash" }],
      segmentEmbeddings: [{ segment_id: "quiet", content_hash: "hash" }],
    })).toMatchObject({
      currentTermCount: 1,
      currentEmbeddingCount: 1,
      missingTerms: 0,
      missingEmbeddings: 0,
    });
  });
});
