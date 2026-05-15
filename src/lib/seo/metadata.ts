import { getPublicSiteOrigin } from "@/lib/site-url";

export const SEO_AUTHOR_NAME = "Andrew Davies";
export const SEO_SITE_NAME = "Crashboard";
export const SEO_DEFAULT_IMAGE = "/images/marketing/crashboard-hero.png";
export const SEO_DEFAULT_DESCRIPTION =
  "Andrew Davies' public wiki and blog on AI workflows, knowledge systems, defence strategy, and source-backed research notes.";

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
  const lastSpace = slice.lastIndexOf(" ");
  const trimmed = (lastSpace > 90 ? slice.slice(0, lastSpace) : slice).trim();
  return `${trimmed.replace(/[.,;:!?-]+$/, "")}.`;
}

export function jsonLd(data: Record<string, unknown> | Array<Record<string, unknown>>) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
