import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiPageView } from "@/components/wiki/wiki-page-view";
import { StructuredData } from "@/components/seo/structured-data";
import {
  buildWikiPageFaq,
  getPageAnswerQuestion,
  getWikiAeoTargetsForPage,
} from "@/lib/public-wiki/aeo";
import { deriveWikiKeyTakeaways } from "@/lib/public-wiki/article-summary";
import { clusterLabel } from "@/lib/public-wiki/reader-paths";
import {
  getPublicWikiIndex,
  getPublicWikiPage,
  getPublicWikiPageMeta,
  getPublicWikiPageSlugs,
} from "@/lib/public-wiki/data";
import {
  SEO_AUTHOR_NAME,
  SEO_AUTHOR_SAME_AS,
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
    keywords: [page.cluster, clusterLabel(page.cluster), page.role, page.title],
    authors: [{ name: SEO_AUTHOR_NAME, url: absoluteSiteUrl("/about") }],
    openGraph: {
      title: page.title,
      description,
      url: canonical,
      images: [{ url: page.heroImage, width: 1200, height: 630 }],
      type: "article",
      authors: [SEO_AUTHOR_NAME],
      section: clusterLabel(page.cluster),
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
  const canonical = canonicalUrl(`/wiki/${page.slug}`);
  const faq = buildWikiPageFaq(page, deriveWikiKeyTakeaways(page));

  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "TechArticle",
              "@id": `${canonical}#article`,
              headline: page.title,
              description: compactDescription(page.description),
              image: absoluteSiteUrl(page.heroImage),
              inLanguage: "en",
              author: {
                "@type": "Person",
                name: SEO_AUTHOR_NAME,
                url: absoluteSiteUrl("/about"),
                sameAs: SEO_AUTHOR_SAME_AS,
              },
              publisher: { "@type": "Person", name: SEO_AUTHOR_NAME },
              isPartOf: {
                "@type": "WebSite",
                name: SEO_SITE_NAME,
                url: absoluteSiteUrl("/"),
              },
              mainEntityOfPage: canonical,
              articleSection: clusterLabel(page.cluster),
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
                clusterLabel(page.cluster),
                page.role,
                ...answerTargets.map((target) => target.topic),
              ],
              wordCount: page.wordCount,
              timeRequired: `PT${Math.max(1, page.readingMinutes)}M`,
              dateModified: index.generatedAt,
            },
            {
              "@type": "BreadcrumbList",
              "@id": `${canonical}#breadcrumb`,
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Home",
                  item: absoluteSiteUrl("/"),
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Wiki",
                  item: absoluteSiteUrl("/wiki"),
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: page.title,
                  item: canonical,
                },
              ],
            },
            ...(faq.length > 0
              ? [
                  {
                    "@type": "FAQPage",
                    "@id": `${canonical}#faq`,
                    mainEntity: faq.map((entry) => ({
                      "@type": "Question",
                      name: entry.question,
                      acceptedAnswer: {
                        "@type": "Answer",
                        text: entry.answer,
                      },
                    })),
                  },
                ]
              : []),
          ],
        }}
      />
      <WikiPageView page={page} index={index} />
    </>
  );
}
