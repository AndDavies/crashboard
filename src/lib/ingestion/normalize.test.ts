import { describe, expect, it } from "vitest";
import { stripControlCharacters } from "@/lib/ingestion/normalize";

describe("stripControlCharacters", () => {
  it("removes database-invalid controls and unpaired surrogates while preserving emoji", () => {
    expect(stripControlCharacters("A\u0000B\uD800C😀\u0007D"))
      .toBe("ABC😀D");
  });

  it("preserves readable whitespace", () => {
    expect(stripControlCharacters("one\ttwo\nthree\rfour"))
      .toBe("one\ttwo\nthree\rfour");
  });
});
