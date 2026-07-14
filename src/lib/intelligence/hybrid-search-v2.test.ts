import { describe, expect, it } from "vitest";
import { unifiedRankedSearchResults } from "@/lib/intelligence/search-ranking-v2";

describe("Intelligence hybrid search ranking", () => {
  it("publishes one bounded ranked contract across catalog and document results", () => {
    const ranked = unifiedRankedSearchResults(
      [{ id: "topic:1" }],
      [{ documentId: "document-1" }],
      10,
    );

    expect(ranked).toEqual([
      { id: "topic:1", resultType: "catalog" },
      { id: "document:document-1", resultType: "document" },
    ]);
  });

  it("deduplicates result IDs and honours the requested limit", () => {
    const document = (documentId: string) => ({ documentId });
    expect(unifiedRankedSearchResults([], [document("1"), document("1"), document("2")], 2))
      .toEqual([
        { id: "document:1", resultType: "document" },
        { id: "document:2", resultType: "document" },
      ]);
  });
});
