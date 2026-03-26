import { describe, expect, it } from "vitest";
import {
  getKnowledgebaseAlternateSourceLink,
  getKnowledgebasePreferredSourceLink,
} from "@/lib/knowledgebase/source-links";

describe("knowledgebase source links", () => {
  it("prefers Drive open links when present in metadata", () => {
    const link = getKnowledgebasePreferredSourceLink({
      originalUrl: "https://drive.google.com/file/d/abc/view",
      canonicalUrl: null,
      metadata: {
        drive_open_url: "https://drive.google.com/file/d/abc/view",
        drive_download_url: "https://drive.google.com/uc?export=download&id=abc",
      },
    });

    expect(link.label).toBe("Open in Drive");
    expect(link.href).toContain("drive.google.com/file/d/abc/view");

    const alternate = getKnowledgebaseAlternateSourceLink({
      originalUrl: "https://drive.google.com/file/d/abc/view",
      canonicalUrl: null,
      metadata: {
        drive_open_url: "https://drive.google.com/file/d/abc/view",
        drive_download_url: "https://drive.google.com/uc?export=download&id=abc",
      },
    });

    expect(alternate?.label).toBe("Direct PDF URL");
  });

  it("falls back to canonical then original urls", () => {
    expect(
      getKnowledgebasePreferredSourceLink({
        originalUrl: "https://example.com/original",
        canonicalUrl: "https://example.com/canonical",
        metadata: {},
      }),
    ).toMatchObject({ href: "https://example.com/canonical", kind: "canonical" });

    expect(
      getKnowledgebasePreferredSourceLink({
        originalUrl: "https://example.com/original",
        canonicalUrl: null,
        metadata: {},
      }),
    ).toMatchObject({ href: "https://example.com/original", kind: "original" });
  });
});
