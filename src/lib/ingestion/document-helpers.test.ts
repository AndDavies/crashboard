import { describe, expect, it } from "vitest";
import {
  extractUrlHost,
  mapLeroyTypeToTagType,
  normalizeLinkRelation,
  normalizeUserTagLabel,
} from "@/lib/ingestion/document-helpers";

describe("extractUrlHost", () => {
  it("reads hostname from https URL", () => {
    expect(extractUrlHost("https://WWW.Example.COM/path")).toBe("www.example.com");
  });

  it("returns null for empty", () => {
    expect(extractUrlHost("   ")).toBeNull();
  });
});

describe("normalizeUserTagLabel", () => {
  it("strips hashes and lowercases", () => {
    expect(normalizeUserTagLabel("#AI")).toEqual({
      tag: "ai",
      tag_normalized: "ai",
    });
  });
});

describe("mapLeroyTypeToTagType", () => {
  it("maps topic and defaults unknown", () => {
    expect(mapLeroyTypeToTagType("topic")).toBe("topic");
    expect(mapLeroyTypeToTagType("banana")).toBe("leroy_keyword");
    expect(mapLeroyTypeToTagType(undefined)).toBe("leroy_keyword");
  });
});

describe("normalizeLinkRelation", () => {
  it("defaults and accepts linked_article", () => {
    expect(normalizeLinkRelation(null)).toBe("mentioned_in");
    expect(normalizeLinkRelation("linked_article")).toBe("linked_article");
  });
});
