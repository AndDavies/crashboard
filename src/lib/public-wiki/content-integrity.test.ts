import { describe, expect, it } from "vitest";
import allPagesData from "@/content/wiki/generated/all-pages.json";
import { sanitizePublicWikiMarkdown } from "@/lib/public-wiki/markdown";
import type { PublicWikiPage } from "@/lib/public-wiki/types";

describe("public wiki content integrity", () => {
  it("removes vault-only links and image references from every generated page", () => {
    const pages = allPagesData as PublicWikiPage[];

    for (const page of pages) {
      const markdown = sanitizePublicWikiMarkdown(page.markdown);
      expect(markdown, page.slug).not.toMatch(
        /(?:\.\.\/(?:assets|views)\/|file:\/\/|\/Users\/|\.canvas[)>])/i,
      );
    }
  });

  it("keeps the useful label when stripping a vault-only link", () => {
    const markdown = sanitizePublicWikiMarkdown(
      "[Open the local view](<../views/example.canvas>) and ![chart](../assets/chart.png)",
    );

    expect(markdown).toContain("Open the local view");
    expect(markdown).not.toContain("../");
  });
});
