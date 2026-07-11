import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/intelligence/long-tail";

describe("long-tail concept controls", () => {
  it("retains specific analytical themes and suppresses newsletter boilerplate", () => {
    expect(__testables.eligibleLongTail("sovereign cloud procurement")).toBe(true);
    expect(__testables.eligibleLongTail("Daily")).toBe(false);
    expect(__testables.eligibleLongTail("newsletter")).toBe(false);
  });
});
