import { createHash } from "node:crypto";
import { load } from "cheerio";
import sanitizeHtml from "sanitize-html";
import { stripControlCharacters } from "@/lib/ingestion/normalize";
import {
  chooseCanonicalSourceUrl,
  normalizeSourceUrl,
  sourceUrlHost,
} from "@/lib/intelligence/source-url";
import type { IntelligenceDocumentSegmentInput } from "@/lib/intelligence/types";

export const INTELLIGENCE_SEGMENT_PARSER_VERSION = "newsletter-segments-v1";

const FOOTER_PATTERN =
  /\b(unsubscribe|manage (?:your )?preferences|email preferences|view (?:this )?email in (?:your )?browser|privacy policy|copyright ©|all rights reserved)\b/iu;
const SPONSOR_PATTERN =
  /\b(sponsored|advertisement|paid placement|partner content|presented by|from our sponsor)\b/iu;
const NAVIGATION_PATTERN =
  /\b(read online|view in browser|follow us|share this|forward to a friend|sign in|subscribe now)\b/iu;

function compact(value: string) {
  return stripControlCharacters(value)
    .replace(/\u00a0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function cleanHtmlText(value: string) {
  return compact(
    sanitizeHtml(
      value.replace(
        /<\/?(?:p|div|li|br|h[1-6]|tr|td|article|section)\b[^>]*>/giu,
        "\n",
      ),
      { allowedTags: [], allowedAttributes: {} },
    ),
  );
}

function hashText(value: string) {
  return createHash("sha256").update(compact(value).toLowerCase()).digest("hex");
}

function roughTokenCount(value: string) {
  return compact(value).split(/\s+/u).filter(Boolean).length;
}

function inferredTitle(value: string, fallback: string | null | undefined) {
  const cleaned = compact(value);
  if (cleaned) return cleaned.slice(0, 280);
  const sentence = compact(fallback ?? "").split(/(?<=[.!?])\s+/u)[0] ?? "";
  return sentence.slice(0, 280) || null;
}

function segmentType(text: string, title: string | null, linkCount: number) {
  const combined = `${title ?? ""} ${text}`;
  if (SPONSOR_PATTERN.test(combined)) return "sponsored" as const;
  if (FOOTER_PATTERN.test(combined)) return "footer" as const;
  if (NAVIGATION_PATTERN.test(combined) || (text.length < 220 && linkCount >= 4)) {
    return "navigation" as const;
  }
  return "editorial" as const;
}

export function buildFallbackSegment(input: {
  title?: string | null;
  contentText: string;
  canonicalUrl?: string | null;
}): IntelligenceDocumentSegmentInput {
  const contentText = compact(input.contentText);
  return {
    segmentIndex: 0,
    segmentType: "unknown",
    title: input.title?.trim() || null,
    contentText,
    outboundUrl: normalizeSourceUrl(input.canonicalUrl),
    urlHost: sourceUrlHost(input.canonicalUrl),
    contentHash: hashText(contentText),
    tokenCount: roughTokenCount(contentText),
    parserVersion: INTELLIGENCE_SEGMENT_PARSER_VERSION,
    confidence: 0.35,
    metadata: { fallback: true },
  };
}

export function segmentNewsletterContent(input: {
  html: string;
  plainText: string;
  fallbackTitle?: string | null;
  fallbackCanonicalUrl?: string | null;
}): IntelligenceDocumentSegmentInput[] {
  if (!input.html.trim()) {
    return [
      buildFallbackSegment({
        title: input.fallbackTitle,
        contentText: input.plainText,
        canonicalUrl: input.fallbackCanonicalUrl,
      }),
    ];
  }

  const $ = load(input.html);
  $("script,style,noscript,svg,canvas,form,input,button").remove();
  $("img").filter((_, element) => {
    const width = Number($(element).attr("width") ?? 0);
    const height = Number($(element).attr("height") ?? 0);
    return width <= 2 || height <= 2;
  }).remove();

  const candidates: Array<{ html: string; heading: string; linkCount: number }> = [];
  const seenContainers = new Set<unknown>();

  $("h1,h2,h3,h4").each((_, element) => {
    const heading = compact($(element).text());
    if (!heading || FOOTER_PATTERN.test(heading)) return;
    let container = $(element).parent();
    let selected = container;
    for (let depth = 0; depth < 5 && container.length; depth += 1) {
      const textLength = compact(container.text()).length;
      if (textLength >= 100 && textLength <= 8_000) {
        selected = container;
        break;
      }
      if (textLength > 8_000) break;
      container = container.parent();
    }
    const node = selected.get(0);
    if (!node || seenContainers.has(node)) return;
    seenContainers.add(node);
    candidates.push({
      html: selected.html() ?? "",
      heading,
      linkCount: selected.find("a[href]").length,
    });
  });

  if (candidates.length < 2) {
    $("article,[role='article'],section,td").each((_, element) => {
      if (candidates.length >= 80) return;
      const container = $(element);
      const text = compact(container.text());
      const linkCount = container.find("a[href]").length;
      if (text.length < 140 || text.length > 5_000 || linkCount === 0) return;
      const node = container.get(0);
      if (!node || seenContainers.has(node)) return;
      seenContainers.add(node);
      candidates.push({
        html: container.html() ?? "",
        heading: compact(container.find("h1,h2,h3,h4,strong,b").first().text()),
        linkCount,
      });
    });
  }

  const accepted: Array<Omit<IntelligenceDocumentSegmentInput, "segmentIndex">> = [];
  const acceptedHashes = new Set<string>();
  for (const candidate of candidates) {
    const contentText = cleanHtmlText(candidate.html);
    if (contentText.length < 100) continue;
    const contentHash = hashText(contentText);
    if (acceptedHashes.has(contentHash)) continue;
    if (
      accepted.some(
        (segment) =>
          segment.contentText.includes(contentText) || contentText.includes(segment.contentText),
      )
    ) {
      continue;
    }
    const fragment = load(candidate.html);
    const links = fragment("a[href]")
      .map((_, element) => fragment(element).attr("href") ?? "")
      .get()
      .map((value) => normalizeSourceUrl(value))
      .filter((value): value is string => Boolean(value));
    const outboundUrl = chooseCanonicalSourceUrl(links);
    const title = inferredTitle(candidate.heading, contentText);
    const type = segmentType(contentText, title, candidate.linkCount);
    acceptedHashes.add(contentHash);
    accepted.push({
      segmentType: type,
      title,
      contentText,
      outboundUrl,
      urlHost: sourceUrlHost(outboundUrl),
      contentHash,
      tokenCount: roughTokenCount(contentText),
      parserVersion: INTELLIGENCE_SEGMENT_PARSER_VERSION,
      confidence: type === "editorial" ? (outboundUrl ? 0.9 : 0.72) : 0.8,
      metadata: { fallback: false, link_count: candidate.linkCount },
    });
  }

  const editorialCount = accepted.filter((segment) => segment.segmentType === "editorial").length;
  if (!accepted.length || editorialCount === 0) {
    return [
      buildFallbackSegment({
        title: input.fallbackTitle,
        contentText: input.plainText || cleanHtmlText(input.html),
        canonicalUrl: input.fallbackCanonicalUrl,
      }),
    ];
  }

  return accepted.slice(0, 50).map((segment, segmentIndex) => ({
    ...segment,
    segmentIndex,
  }));
}

export const __testables = {
  cleanHtmlText,
  hashText,
  segmentType,
};
