import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  __testables,
  cleanupExcludedSegmentArtifacts,
} from "@/lib/intelligence/signal-persistence";

describe("signal persistence text safety", () => {
  it("sanitizes evidence excerpts and surface forms before JSON persistence", () => {
    expect(__testables.safeEvidenceText("  before\u0000 after\uD800  "))
      .toBe("before after");
    expect(__testables.safeStringList(["AI\u0007", "", "😀", "\uD800"]))
      .toEqual(["AI", "😀"]);
  });

  it("keeps excluded newsletter segments out of concept extraction", () => {
    const included = {
      id: "segment-editorial",
      segmentIndex: 0,
      segmentType: "editorial" as const,
      title: "Counter-drone trial",
      contentText: "Canada is testing a counter-drone system.",
      outboundUrl: null,
      urlHost: null,
      contentHash: "hash-editorial",
      tokenCount: 7,
      parserVersion: "test",
      confidence: 0.95,
      exclusionReason: null,
      metadata: {},
    };
    const excluded = {
      ...included,
      id: "segment-sponsored",
      segmentIndex: 1,
      segmentType: "sponsored" as const,
      contentHash: "hash-sponsored",
      exclusionReason: "sponsored" as const,
    };

    expect(__testables.analysisEligibleSegments([included, excluded]).map((row) => row.id))
      .toEqual(["segment-editorial"]);
  });

  it("also excludes non-editorial segment types without an exclusion reason", () => {
    const sponsored = {
      id: "segment-sponsored",
      segmentIndex: 0,
      segmentType: "sponsored" as const,
      title: "Sponsor",
      contentText: "Promotional copy",
      outboundUrl: null,
      urlHost: null,
      contentHash: "hash",
      tokenCount: 2,
      parserVersion: "test",
      confidence: 0.9,
      exclusionReason: null,
      metadata: {},
    };
    expect(__testables.analysisEligibleSegments([sponsored])).toEqual([]);
  });

  it("clears every derived artifact and both graph-edge directions", async () => {
    const calls: Array<{ table: string; column: string; ids: string[] }> = [];
    const admin = {
      from(table: string) {
        return {
          delete() {
            return {
              eq() {
                return {
                  async in(column: string, ids: string[]) {
                    calls.push({ table, column, ids });
                    return { error: null };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(cleanupExcludedSegmentArtifacts(
      admin,
      "owner",
      ["excluded", "excluded"],
    )).resolves.toEqual({ segments: 1, deletes: 9 });
    expect(calls).toEqual(expect.arrayContaining([
      { table: "intelligence_topic_knn_edges", column: "left_segment_id", ids: ["excluded"] },
      { table: "intelligence_topic_knn_edges", column: "right_segment_id", ids: ["excluded"] },
      { table: "intelligence_term_observations", column: "segment_id", ids: ["excluded"] },
      { table: "intelligence_term_processing_state", column: "segment_id", ids: ["excluded"] },
      { table: "intelligence_segment_embeddings", column: "segment_id", ids: ["excluded"] },
      { table: "intelligence_cluster_segments", column: "segment_id", ids: ["excluded"] },
      { table: "intelligence_document_concepts", column: "segment_id", ids: ["excluded"] },
      { table: "intelligence_term_signal_refresh_segments", column: "segment_id", ids: ["excluded"] },
      { table: "intelligence_topic_knn_members", column: "segment_id", ids: ["excluded"] },
    ]));
  });
});
