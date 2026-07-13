import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/intelligence/signal-persistence";

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
});
