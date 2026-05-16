import { describe, expect, it } from "vitest";
import { buildBlogImagePrompt } from "@/lib/blog/image-guidelines";
import {
  BlogEnrichmentModelOutputSchema,
  normalizeGeneratedSlug,
  prepareBlogEnrichmentResult,
  stripHtmlToText,
  truncateForPrompt,
} from "@/lib/blog/enrichment";

const modelOutput = BlogEnrichmentModelOutputSchema.parse({
  title: "What Agent Memory Should Preserve",
  slug: "What Agent Memory Should Preserve!",
  excerpt: "A practical article about what durable agent memory should keep.",
  seoTitle: "What Agent Memory Should Preserve",
  metaDescription:
    "Learn what agent memory should preserve so AI workflows keep useful operating context without hoarding noise.",
  focusTopic: "Agent memory",
  tags: ["agent memory", "AI workflows", "agent memory", "knowledge systems"],
  answerSummary:
    "Agent memory should preserve decisions, constraints, evidence, and next actions that help future work resume with context.",
  relatedWikiSlugs: ["agent-memory", "missing-page"],
  imageBriefs: {
    cover: {
      idea: "Memory as an operating record under pressure",
      objects: ["ruck", "field notebook", "taped map", "timing tag"],
      text: "",
    },
    inlineWide: {
      idea: "A field map of durable context",
      objects: ["muddy boots", "folded map", "notebook", "index cards"],
      text: "",
    },
    inlineSquare: {
      idea: "A compact checkpoint for repeatable memory",
      objects: ["stopwatch", "checklist", "field notebook", "black tape"],
      text: "CHECKPOINT",
    },
  },
  warnings: ["Article does not include source links."],
});

describe("blog enrichment helpers", () => {
  it("normalizes generated slugs", () => {
    expect(normalizeGeneratedSlug(" What Agent Memory Should Preserve! ")).toBe(
      "what-agent-memory-should-preserve",
    );
  });

  it("extracts and truncates article text for prompts", () => {
    const text = stripHtmlToText("<h1>Title</h1><p>Body&nbsp;copy.</p>");
    expect(text).toBe("Title Body copy.");
    expect(truncateForPrompt(`${"word ".repeat(200)}`, 80).length).toBeLessThanOrEqual(
      80,
    );
  });

  it("prepares structured enrichment output and deterministic image prompts", () => {
    const result = prepareBlogEnrichmentResult(modelOutput, ["agent-memory"]);

    expect(result.slug).toBe("what-agent-memory-should-preserve");
    expect(result.relatedWikiSlugs).toEqual(["agent-memory"]);
    expect(result.tags).toEqual([
      "agent memory",
      "AI workflows",
      "knowledge systems",
    ]);
    expect(result.imagePrompts.cover.dimensions).toBe("1200 x 630 px");
    expect(result.imagePrompts.cover.prompt).toContain("near-black #050505");
    expect(result.imagePrompts.cover.prompt).toContain("race gold #F7C600");
    expect(result.imagePrompts.cover.prompt).toContain(
      "Do not copy Ruck Race League names",
    );
  });

  it("builds prompts that follow the Crashboard image skill style", () => {
    const prompt = buildBlogImagePrompt({
      format: "inline-wide",
      title: "Trust Boundaries and Assurance",
      topic: "AI assurance",
      idea: "Boundaries shown as physical inspection lines",
      objects: ["clipboard", "evidence tags", "gravel", "sealed case"],
    });

    expect(prompt).toContain("1200 x 675 px");
    expect(prompt).toContain("70-85% of the image black");
    expect(prompt).toContain("Black-and-white documentary field photography");
    expect(prompt).toContain("Avoid:");
    expect(prompt).not.toContain("Use a Ruck Race League-inspired visual");
  });
});
