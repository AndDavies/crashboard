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
      idea: "Memory as a selective operating record on a source-backed paper grid",
      objects: ["field notebook", "index cards", "printed report", "black tape"],
      text: "",
    },
    inlineWide: {
      idea: "A mapped trail of durable context across linked source packets",
      objects: ["marked source packets", "cables", "index cards", "concrete"],
      text: "",
    },
    inlineSquare: {
      idea: "A compact checkpoint for repeatable memory handoff",
      objects: ["access checklist", "field notebook", "acid-lime tape edge", "black tape"],
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
    expect(result.imagePrompts.cover.prompt).toContain("warm off-white #FAF9F6");
    expect(result.imagePrompts.cover.prompt).toContain(
      "Crashboard acid-lime accent #E5FC00",
    );
    expect(result.imagePrompts.cover.prompt).toContain(
      "Crashboard minimalist street/Bauhaus editorial style",
    );
    expect(result.imagePrompts.cover.prompt).not.toContain("Ruck Race League");
  });

  it("builds prompts that follow the Crashboard image skill style", () => {
    const prompt = buildBlogImagePrompt({
      format: "inline-wide",
      title: "Trust Boundaries and Assurance",
      topic: "AI assurance",
      idea: "Boundaries shown as physical inspection lines",
      objects: ["access checklist", "taped boundary line", "network cable", "source packet"],
    });

    expect(prompt).toContain("1200 x 675 px");
    expect(prompt).toContain("Use case: photorealistic-editorial");
    expect(prompt).toContain("Crashboard minimalist street/Bauhaus editorial style");
    expect(prompt).toContain("2-6% of the image");
    expect(prompt).toContain("No action-event aesthetics");
    expect(prompt).not.toContain("race gold");
  });
});
