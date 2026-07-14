import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync(
  new URL("../../../scripts/intelligence-v2-evaluate.ts", import.meta.url),
  "utf8",
);

describe("Intelligence v2 evaluation runner", () => {
  it("does not offset-page the full historical signal series", () => {
    expect(runner).toContain("intelligence_v2_evaluation_signal_fingerprint");
    expect(runner).toContain('.eq("signal_date", provenance.completeThrough)');
    expect(runner).toContain('.gt("signal_key", cursor)');
    expect(runner).toContain('const directions = ["new", "rising", "cooling"]');
    expect(runner).toContain(".limit(250)");
    expect(runner).not.toContain('{ label: "evaluation signals" }');
    expect(runner).not.toContain('{ label: "evaluation signal fingerprint" }');
  });

  it("accepts only completed pruned compact validation checkpoints", () => {
    expect(runner).toContain("checkpoint.evaluation_signal_snapshot");
    expect(runner).toContain("INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION");
    expect(runner).toContain("checkpoint.validation_generation_pruned === true");
    expect(runner).toContain("retainCompactValidationSnapshot");
    expect(runner).toContain("Compact validation snapshot does not match");
    expect(runner).toContain("Rehydrated retained baseline provenance");
  });

  it("benchmarks the requested range against the history actually retained", () => {
    expect(runner).toContain('chartUrl.searchParams.set("range", "365d")');
    expect(runner).toContain("Five complete-day signals are required");
    expect(runner).toContain("series.length < 12");
    expect(runner).not.toContain("series.length < 48");
  });
});
