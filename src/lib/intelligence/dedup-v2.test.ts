import { describe, expect, it } from "vitest";
import { titleSimilarity } from "@/lib/intelligence/dedup-v2";

describe("story and event deduplication", () => {
  it("recognizes equivalent announcement titles but not unrelated roundups", () => {
    expect(titleSimilarity(
      "Canada awards C-UAS interceptor trial contract",
      "C-UAS interceptor trial contract awarded by Canada",
    )).toBe(1);
    expect(titleSimilarity(
      "Canada awards C-UAS interceptor trial contract",
      "Weekly defence industry roundup",
    )).toBeLessThan(0.3);
  });
});
