import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiPageView } from "@/components/wiki/wiki-page-view";
import {
  getPublicWikiIndex,
  getPublicWikiPage,
  getPublicWikiPageMeta,
  getPublicWikiPageSlugs,
} from "@/lib/public-wiki/data";

export function generateStaticParams() {
  return getPublicWikiPageSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getPublicWikiPageMeta(slug);
  if (!page) return {};

  return {
    title: `${page.title} | Wiki`,
    description: page.description,
    openGraph: {
      title: page.title,
      description: page.description,
      images: [page.heroImage],
    },
  };
}

export default async function PublicWikiDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [page, index] = await Promise.all([
    getPublicWikiPage(slug),
    Promise.resolve(getPublicWikiIndex()),
  ]);

  if (!page) notFound();

  return <WikiPageView page={page} index={index} />;
}
