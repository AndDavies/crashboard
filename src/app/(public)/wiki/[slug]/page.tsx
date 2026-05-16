import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiPageView } from "@/components/wiki/wiki-page-view";
import { StructuredData } from "@/components/seo/structured-data";
import { getPageAnswerQuestion, getWikiAeoTargetsForPage } from "@/lib/public-wiki/aeo";
import {
  getPublicWikiIndex,
  getPublicWikiPage,
  getPublicWikiPageMeta,
  getPublicWikiPageSlugs,
} from "@/lib/public-wiki/data";
import {
  SEO_AUTHOR_NAME,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
  compactDescription,
} from "@/lib/seo/metadata";

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
  const description = compactDescription(page.description);
  const canonical = canonicalUrl(`/wiki/${page.slug}`);

  return {
    title: `${page.title} | Wiki`,
    description,
    alternates: { canonical },
    openGraph: {
      title: page.title,
      description,
      url: canonical,
      images: [{ url: page.heroImage, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description,
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
  const answerTargets = getWikiAeoTargetsForPage(page);

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: page.title,
          description: compactDescription(page.description),
          image: absoluteSiteUrl(page.heroImage),
          author: {
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
            url: absoluteSiteUrl("/about"),
          },
          publisher: { "@type": "Person", name: SEO_AUTHOR_NAME },
          isPartOf: {
            "@type": "WebSite",
            name: SEO_SITE_NAME,
            url: absoluteSiteUrl("/"),
          },
          mainEntityOfPage: canonicalUrl(`/wiki/${page.slug}`),
          articleSection: page.cluster,
          about: {
            "@type": "Thing",
            name: getPageAnswerQuestion(page),
            description: page.description,
          },
          mentions: answerTargets.map((target) => ({
            "@type": "Thing",
            name: target.topic,
            description: target.question,
          })),
          keywords: [
            page.cluster,
            page.role,
            ...answerTargets.map((target) => target.topic),
          ],
          wordCount: page.wordCount,
          dateModified: index.generatedAt,
        }}
      />
      <WikiPageView page={page} index={index} />
    </>
  );
}
