import { describe, expect, it } from "vitest";
import { deriveWikiArticleSummary } from "@/lib/public-wiki/article-summary";
import { stripWikiOwnedMarkdownSections } from "@/lib/public-wiki/markdown";
import {
  clusterLabel,
  getReaderPathPages,
  type WikiReaderPath,
} from "@/lib/public-wiki/reader-paths";
import type { PublicWikiIndex, PublicWikiPage } from "@/lib/public-wiki/types";

const basePage = {
  slug: "agent-memory-and-context-systems",
  title: "Agent Memory and Context Systems",
  description:
    "Agent memory should preserve durable operating context without turning every transcript into permanent truth.",
  role: "hub",
  cluster: "memory",
  visualStatus: "generated",
  headings: [
    { id: "core-thesis", level: 2, text: "Core thesis" },
    { id: "related", level: 2, text: "Related" },
  ],
  related: ["llm-memory"],
  linkedSlugs: ["llm-memory", "context-compaction"],
  sourceNotes: ["raw/Agent Memory.md", "raw/Context Compaction.md"],
  markdown: `# Agent Memory and Context Systems

## Core thesis

- Memory should preserve decisions, constraints, evidence, and next actions.
- Context should be compact enough to travel between sessions.
- Source trails matter because future work needs recoverable evidence.

## Related

- [LLM Memory](/wiki/llm-memory)

## Source notes

- raw/Agent Memory.md
`,
  plainText: "",
  wordCount: 450,
  readingMinutes: 3,
  charts: [],
  heroImage: "/wiki/generated-images/agent-memory-and-context-systems.svg",
  contentHash: "hash",
} satisfies PublicWikiPage;

const relatedPage = {
  ...basePage,
  slug: "llm-memory",
  title: "LLM Memory",
  role: "concept",
  sourceNotes: ["raw/LLM Memory.md"],
  readingMinutes: 5,
  linkedSlugs: [],
} satisfies PublicWikiPage;

const index = {
  generatedAt: "2026-05-20T00:00:00.000Z",
  sourceLabel: "test",
  pages: [basePage, relatedPage],
  clusters: [
    { id: "foundations", label: "foundations", count: 1 },
    { id: "memory", label: "memory", count: 2 },
  ],
  roles: [{ id: "hub", label: "hub", count: 1 }],
  graph: {
    nodes: [
      {
        id: basePage.slug,
        title: basePage.title,
        cluster: basePage.cluster,
        role: basePage.role,
        href: `/wiki/${basePage.slug}`,
      },
    ],
    edges: [],
  },
} satisfies PublicWikiIndex;

describe("wiki reader refactor helpers", () => {
  it("strips markdown endings owned by the React article UI", () => {
    const stripped = stripWikiOwnedMarkdownSections(basePage.markdown);

    expect(stripped).toContain("## Core thesis");
    expect(stripped).not.toContain("## Related");
    expect(stripped).not.toContain("## Source notes");
    expect(stripped).not.toContain("raw/Agent Memory.md");
  });

  it("derives article summaries from generated wiki data", () => {
    const summary = deriveWikiArticleSummary(basePage, index);

    expect(summary.keyTakeaways).toEqual([
      "Memory should preserve decisions, constraints, evidence, and next actions.",
      "Context should be compact enough to travel between sessions.",
      "Source trails matter because future work needs recoverable evidence.",
    ]);
    expect(summary.relatedNextRead?.slug).toBe("llm-memory");
    expect(summary.sourceBacking).toBe("2 source notes support this synthesis.");
  });

  it("resolves reader path pages and tolerates missing configured slugs", () => {
    const path: WikiReaderPath = {
      id: "test",
      title: "Test path",
      promise: "Test promise",
      description: "Test description",
      primarySlug: basePage.slug,
      supportingSlugs: ["missing-page", relatedPage.slug],
    };

    expect(getReaderPathPages(path, index.pages).map((page) => page.slug)).toEqual([
      basePage.slug,
      relatedPage.slug,
    ]);
    expect(clusterLabel("foundations")).toBe("Start Here");
  });
});
