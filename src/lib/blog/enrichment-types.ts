import type { BlogImageFormatId } from "@/lib/blog/image-guidelines";

export type BlogImagePromptResult = {
  format: BlogImageFormatId;
  label: string;
  dimensions: string;
  ratio: string;
  prompt: string;
};

export type BlogEnrichmentResult = {
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  metaDescription: string;
  focusTopic: string;
  tags: string[];
  answerSummary: string;
  relatedWikiSlugs: string[];
  imagePrompts: {
    cover: BlogImagePromptResult;
    inlineWide: BlogImagePromptResult;
    inlineSquare: BlogImagePromptResult;
  };
  warnings: string[];
};
