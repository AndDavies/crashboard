import { describe, expect, it } from "vitest";
import {
  analysisPhasePrecedesCheckpoint,
  analysisProcessedCount,
} from "@/lib/intelligence/analysis-refresh";

describe("resumable Intelligence analysis phases", () => {
  it("skips only phases already completed before the saved checkpoint", () => {
    expect(analysisPhasePrecedesCheckpoint("segmentation", "terms")).toBe(true);
    expect(analysisPhasePrecedesCheckpoint("terms", "terms")).toBe(false);
    expect(analysisPhasePrecedesCheckpoint("embeddings", "terms")).toBe(false);
    expect(analysisPhasePrecedesCheckpoint("terms", "unknown")).toBe(false);
  });

  it("reads progress from both top-level and phase-specific results", () => {
    expect(analysisProcessedCount({ scanned: 10 }, "segmentation")).toBe(10);
    expect(analysisProcessedCount({ terms: { processed: 100 } }, "terms")).toBe(100);
    expect(analysisProcessedCount({ terms: { processed: "invalid" } }, "terms")).toBe(0);
  });
});
