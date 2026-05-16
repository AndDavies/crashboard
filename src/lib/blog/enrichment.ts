import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import {
  BLOG_IMAGE_APPROVED_OBJECTS,
  BLOG_IMAGE_FORMATS,
  buildBlogImagePrompt,
  type BlogImageFormatId,
} from "@/lib/blog/image-guidelines";
import type { BlogEnrichmentResult, BlogImagePromptResult } from "@/lib/blog/enrichment-types";

export const BLOG_ENRICHMENT_MODEL =
  process.env.OPENAI_BLOG_ENRICHMENT_MODEL?.trim() || "gpt-5-mini";

const MAX_ARTICLE_CHARS = 18000;
const MAX_WIKI_PAGES = 80;

const ImageBriefSchema = z
  .object({
    idea: z.string().min(1).max(180),
    objects: z.array(z.string().min(1).max(60)).min(3).max(5),
    text: z.string().max(32),
  })
  .strict();

export const BlogEnrichmentModelOutputSchema = z
  .object({
    title: z.string().min(1).max(90),
    slug: z.string().min(1).max(120),
    excerpt: z.string().min(1).max(240),
    seoTitle: z.string().min(1).max(80),
    metaDescription: z.string().min(1).max(180),
    focusTopic: z.string().min(1).max(90),
    tags: z.array(z.string().min(1).max(40)).min(2).max(8),
    answerSummary: z.string().min(1).max(320),
    relatedWikiSlugs: z.array(z.string().min(1).max(120)).max(5),
    imageBriefs: z
      .object({
        cover: ImageBriefSchema,
        inlineWide: ImageBriefSchema,
        inlineSquare: ImageBriefSchema,
      })
      .strict(),
    warnings: z.array(z.string().min(1).max(180)).max(5),
  })
  .strict();

export const BlogEnrichmentRequestSchema = z
  .object({
    contentHtml: z.string().default(""),
    contentJson: z.string().default(""),
    title: z.string().default(""),
    slug: z.string().default(""),
    excerpt: z.string().default(""),
    seoTitle: z.string().default(""),
    metaDescription: z.string().default(""),
    focusTopic: z.string().default(""),
    tags: z.array(z.string()).default([]),
    answerSummary: z.string().default(""),
    relatedWikiSlugs: z.array(z.string()).default([]),
  })
  .strict();

export type BlogEnrichmentRequest = z.infer<typeof BlogEnrichmentRequestSchema>;
export type BlogEnrichmentModelOutput = z.infer<typeof BlogEnrichmentModelOutputSchema>;

export type BlogEnrichmentWikiPage = {
  slug: string;
  title: string;
  description: string;
};

export type GenerateBlogEnrichmentInput = BlogEnrichmentRequest & {
  wikiPages?: BlogEnrichmentWikiPage[];
};

export function stripHtmlToText(html: string) {
  const spacedHtml = html.replace(
    /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|br|hr)\b[^>]*>/giu,
    " ",
  );

  return sanitizeHtml(spacedHtml, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter(text) {
      return text.replace(/\s+/g, " ");
    },
  })
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateForPrompt(text: string, maxChars = MAX_ARTICLE_CHARS) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;

  const cut = normalized.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxChars - 120 ? cut.slice(0, lastSpace) : cut).trim();
}

export function normalizeGeneratedSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeString(input: string, fallback: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function normalizeList(items: string[], maxItems: number) {
  const seen = new Set<string>();
  return items
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxItems);
}

function normalizeObjects(objects: string[]) {
  const normalized = normalizeList(objects, 5);
  return normalized.length > 0
    ? normalized
    : ["ruck", "field notebook", "taped map", "timing tag"];
}

function imagePromptFor(
  format: BlogImageFormatId,
  title: string,
  topic: string,
  brief: z.infer<typeof ImageBriefSchema>,
): BlogImagePromptResult {
  const formatInfo =
    BLOG_IMAGE_FORMATS.find((candidate) => candidate.id === format) ??
    BLOG_IMAGE_FORMATS[0];

  return {
    format,
    label: formatInfo.label,
    dimensions: formatInfo.dimensions,
    ratio: formatInfo.ratio,
    prompt: buildBlogImagePrompt({
      format,
      title,
      topic,
      idea: normalizeString(brief.idea, "Operational research under pressure"),
      objects: normalizeObjects(brief.objects),
      text: brief.text.trim(),
    }),
  };
}

export function prepareBlogEnrichmentResult(
  output: BlogEnrichmentModelOutput,
  allowedWikiSlugs: string[] = [],
): BlogEnrichmentResult {
  const title = normalizeString(output.title, "Untitled post");
  const focusTopic = normalizeString(output.focusTopic, "AI workflow systems");
  const allowedSlugSet = new Set(allowedWikiSlugs);
  const relatedWikiSlugs = normalizeList(output.relatedWikiSlugs, 5)
    .map(normalizeGeneratedSlug)
    .filter((slug) => allowedSlugSet.size === 0 || allowedSlugSet.has(slug));

  return {
    title,
    slug: normalizeGeneratedSlug(output.slug || title) || "untitled-post",
    excerpt: normalizeString(output.excerpt, ""),
    seoTitle: normalizeString(output.seoTitle, title),
    metaDescription: normalizeString(output.metaDescription, output.excerpt),
    focusTopic,
    tags: normalizeList(output.tags, 8),
    answerSummary: normalizeString(output.answerSummary, output.excerpt),
    relatedWikiSlugs,
    imagePrompts: {
      cover: imagePromptFor("cover", title, focusTopic, output.imageBriefs.cover),
      inlineWide: imagePromptFor(
        "inline-wide",
        title,
        focusTopic,
        output.imageBriefs.inlineWide,
      ),
      inlineSquare: imagePromptFor(
        "inline-square",
        title,
        focusTopic,
        output.imageBriefs.inlineSquare,
      ),
    },
    warnings: normalizeList(output.warnings, 5),
  };
}

function buildSystemPrompt() {
  return `You enrich Crashboard blog drafts for SEO and answer-engine optimization.

Rules:
- Base every field on the supplied article content. Do not invent facts, sources, quotes, metrics, or claims.
- Optimize for clear human readers, search snippets, and answer systems.
- Title should be specific, plain, and useful, not clickbait.
- Slug should be lowercase, hyphenated, and descriptive.
- Excerpt should summarize the article for a blog index.
- SEO title should fit search results and can be slightly tighter than the title.
- Meta description should be concise and useful as a search snippet.
- Tags are the CMS keywords. Use 2-8 short topic phrases.
- Answer summary should directly answer what the article helps the reader understand.
- Related wiki slugs must be chosen only from the supplied wiki page list. Return an empty array if none fit.
- For image briefs, propose only the visual thesis and 3-5 concrete objects. Prefer this object vocabulary: ${BLOG_IMAGE_APPROVED_OBJECTS.join(", ")}.
- Image briefs must avoid fake logos, brand marks, robots, neon sci-fi, floating UI panels, cartoon styles, soft gradients, broad yellow backgrounds, and dense text.`;
}

function buildUserPayload(input: GenerateBlogEnrichmentInput, articleText: string) {
  const wikiPages = (input.wikiPages ?? []).slice(0, MAX_WIKI_PAGES).map((page) => ({
    slug: page.slug,
    title: page.title,
    description: page.description,
  }));

  return JSON.stringify(
    {
      articleText,
      currentFields: {
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt,
        seoTitle: input.seoTitle,
        metaDescription: input.metaDescription,
        focusTopic: input.focusTopic,
        tags: input.tags,
        answerSummary: input.answerSummary,
        relatedWikiSlugs: input.relatedWikiSlugs,
      },
      availableWikiPages: wikiPages,
    },
    null,
    2,
  );
}

export async function generateBlogEnrichment(
  input: GenerateBlogEnrichmentInput,
  options: { client: OpenAI; model?: string },
) {
  const articleText = truncateForPrompt(stripHtmlToText(input.contentHtml));
  if (!articleText) {
    throw new Error("Add article body content before running AI enrichment.");
  }

  const response = await options.client.responses.parse({
    model: options.model ?? BLOG_ENRICHMENT_MODEL,
    input: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPayload(input, articleText) },
    ],
    text: {
      format: zodTextFormat(BlogEnrichmentModelOutputSchema, "blog_enrichment"),
    },
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI response did not include parsed enrichment output.");
  }

  return prepareBlogEnrichmentResult(
    response.output_parsed,
    (input.wikiPages ?? []).map((page) => page.slug),
  );
}
