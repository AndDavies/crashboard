import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/intelligence/signal-persistence";

describe("signal persistence text safety", () => {
  it("sanitizes evidence excerpts and surface forms before JSON persistence", () => {
    expect(__testables.safeEvidenceText("  before\u0000 after\uD800  "))
      .toBe("before after");
    expect(__testables.safeStringList(["AI\u0007", "", "😀", "\uD800"]))
      .toEqual(["AI", "😀"]);
  });
});
