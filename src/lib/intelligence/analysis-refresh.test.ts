import { describe, expect, it } from "vitest";
import { analysisPhasePrecedesCheckpoint } from "@/lib/intelligence/analysis-refresh";

describe("resumable Intelligence analysis phases", () => {
  it("skips only phases already completed before the saved checkpoint", () => {
    expect(analysisPhasePrecedesCheckpoint("segmentation", "terms")).toBe(true);
    expect(analysisPhasePrecedesCheckpoint("terms", "terms")).toBe(false);
    expect(analysisPhasePrecedesCheckpoint("embeddings", "terms")).toBe(false);
    expect(analysisPhasePrecedesCheckpoint("terms", "unknown")).toBe(false);
  });
});
