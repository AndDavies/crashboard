import {
  getPageAnswerQuestion,
  getWikiAeoTargetsForPage,
} from "@/lib/public-wiki/aeo";
import { clusterLabel } from "@/lib/public-wiki/reader-paths";
import type { PublicWikiIndex, PublicWikiIndexPage, PublicWikiPage } from "@/lib/public-wiki/types";

export type WikiArticleSummary = {
  keyTakeaways: string[];
  bestFor: string;
  relatedNextRead: PublicWikiIndexPage | null;
  sourceBacking: string;
};

const TAKEAWAY_SECTION_PRIORITY = [
  "core thesis",
  "practical implications",
  "why this matters",
];

function normalizeHeading(input: string) {
  return input
    .replace(/#+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getSection(markdown: string, targetHeading: string) {
  const lines = markdown.split(/\r?\n/);
  const target = normalizeHeading(targetHeading);
  const section: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const headingText = normalizeHeading(heading[2]);

      if (inSection && level <= 2) break;
      if (level === 2 && headingText === target) {
        inSection = true;
        continue;
      }
    }

    if (inSection) section.push(line);
  }

  return section.join("\n").trim();
}

function cleanInlineMarkdown(input: string) {
  return input
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionBullets(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*[-*]\s+(.+)$/)?.[1] ?? "")
    .map(cleanInlineMarkdown)
    .filter((item) => item.length >= 24 && item.length <= 220);
}

function sentenceFallback(page: PublicWikiPage) {
  const [firstSentence] = page.description.match(/[^.!?]+[.!?]/) ?? [];
  return cleanInlineMarkdown(firstSentence ?? page.description);
}

function headingFallbacks(page: PublicWikiPage) {
  return page.headings
    .filter((heading) => heading.level === 2)
    .map((heading) => `Use this page to understand ${heading.text.toLowerCase()}.`)
    .slice(0, 3);
}

export function deriveWikiKeyTakeaways(page: PublicWikiPage) {
  const takeaways: string[] = [];

  for (const heading of TAKEAWAY_SECTION_PRIORITY) {
    for (const bullet of sectionBullets(getSection(page.markdown, heading))) {
      if (!takeaways.includes(bullet)) takeaways.push(bullet);
      if (takeaways.length === 3) return takeaways;
    }
  }

  if (takeaways.length < 3) takeaways.push(sentenceFallback(page));
  for (const fallback of headingFallbacks(page)) {
    if (takeaways.length === 3) break;
    if (!takeaways.includes(fallback)) takeaways.push(fallback);
  }

  while (takeaways.length < 3) {
    takeaways.push(`Follow the source-backed synthesis around ${page.title}.`);
  }

  return takeaways.slice(0, 3);
}

function relatedScore(page: PublicWikiIndexPage) {
  const roleBonus = page.role === "hub" ? 30 : page.role === "concept" ? 18 : 8;
  return roleBonus + page.sourceNotes.length * 2 + page.readingMinutes;
}

export function deriveWikiArticleSummary(
  page: PublicWikiPage,
  index: PublicWikiIndex,
): WikiArticleSummary {
  const pageBySlug = new Map(index.pages.map((item) => [item.slug, item]));
  const relatedNextRead =
    page.linkedSlugs
      .map((slug) => pageBySlug.get(slug))
      .filter((item): item is PublicWikiIndexPage => Boolean(item))
      .toSorted((a, b) => relatedScore(b) - relatedScore(a))[0] ?? null;
  const directTarget = getWikiAeoTargetsForPage(page).find(
    (target) => target.primarySlug === page.slug,
  );
  const bestFor = directTarget
    ? `Readers trying to answer: ${directTarget.question}`
    : `Readers exploring ${clusterLabel(page.cluster).toLowerCase()} through ${getPageAnswerQuestion(page).toLowerCase()}`;

  return {
    keyTakeaways: deriveWikiKeyTakeaways(page),
    bestFor,
    relatedNextRead,
    sourceBacking:
      page.sourceNotes.length > 0
        ? `${page.sourceNotes.length} source notes support this synthesis.`
        : "No source notes are attached to this page yet.",
  };
}
