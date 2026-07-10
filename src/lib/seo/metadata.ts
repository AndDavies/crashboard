import { getPublicSiteOrigin } from "@/lib/site-url";

export const SEO_AUTHOR_NAME = "Andrew Davies";
export const SEO_SITE_NAME = "Crashboard";
export const SEO_AUTHOR_SAME_AS = [
  "https://github.com/AndDavies",
  "https://x.com/M_AndrewDavies",
];
export const SEO_DEFAULT_IMAGE = "/images/marketing/crashboard-hero.jpg";
export const SEO_DEFAULT_DESCRIPTION =
  "Andrew Davies' public notebook on AI workflows, source-backed research, knowledge-system design, and strategic judgment.";

export function absoluteSiteUrl(path = "/") {
  const origin = getPublicSiteOrigin();
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export function canonicalUrl(path: string) {
  return absoluteSiteUrl(path === "" ? "/" : path);
}

export function compactDescription(input: string, maxLength = 158) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const slice = normalized.slice(0, maxLength - 1);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! "),
  );
  if (sentenceEnd >= 90) return slice.slice(0, sentenceEnd + 1).trim();

  const lastSpace = slice.lastIndexOf(" ");
  const danglingWords = /\b(?:a|an|and|are|as|at|but|by|for|from|in|into|is|of|on|or|the|to|with)$/i;
  let trimmed = (lastSpace > 90 ? slice.slice(0, lastSpace) : slice)
    .trim()
    .replace(/[.,;:!?-]+$/, "");
  while (danglingWords.test(trimmed)) {
    trimmed = trimmed.replace(danglingWords, "").trim().replace(/[,:;-]+$/, "");
  }
  return `${trimmed}.`;
}

export function jsonLd(data: Record<string, unknown> | Array<Record<string, unknown>>) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
