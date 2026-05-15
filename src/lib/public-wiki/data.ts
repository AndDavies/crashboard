import allPagesData from "@/content/wiki/generated/all-pages.json";
import indexData from "@/content/wiki/generated/index.json";
import type { PublicWikiIndex, PublicWikiPage } from "@/lib/public-wiki/types";

const allPages = allPagesData as PublicWikiPage[];
const wikiIndex = indexData as PublicWikiIndex;

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
