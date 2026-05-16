import allPagesData from "@/content/wiki/generated/all-pages.json";
import indexData from "@/content/wiki/generated/index.json";
import type {
  PublicWikiIndex,
  PublicWikiIndexPage,
  PublicWikiPage,
} from "@/lib/public-wiki/types";

const allPages = allPagesData as PublicWikiPage[];
const rawWikiIndex = indexData as PublicWikiIndex & {
  pages: Array<PublicWikiIndexPage & { markdown?: string; plainText?: string }>;
};

function toIndexPage(page: PublicWikiIndexPage & { markdown?: string; plainText?: string }) {
  const { markdown: _markdown, plainText: _plainText, ...indexPage } = page;
  void _markdown;
  void _plainText;
  return indexPage;
}

const wikiIndex: PublicWikiIndex = {
  ...rawWikiIndex,
  pages: rawWikiIndex.pages.map(toIndexPage),
};

export function getPublicWikiIndex() {
  return wikiIndex;
}

export function getPublicWikiPages() {
  return wikiIndex.pages;
}

export function getPublicWikiPageSlugs() {
  return wikiIndex.pages.map((page) => page.slug);
}

export async function getPublicWikiPage(slug: string): Promise<PublicWikiPage | null> {
  return allPages.find((page) => page.slug === slug) ?? null;
}

export function getPublicWikiPageMeta(slug: string) {
  return wikiIndex.pages.find((page) => page.slug === slug) ?? null;
}
