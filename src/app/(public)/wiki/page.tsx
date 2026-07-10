import type { Metadata } from "next";
import { Suspense } from "react";
import { StructuredData } from "@/components/seo/structured-data";
import { WikiExplorer } from "@/components/wiki/wiki-explorer";
import { wikiAeoTargets } from "@/lib/public-wiki/aeo";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import {
  clusterLabel,
  getReaderPathPages,
  getReaderPathPrimaryPage,
  sortClustersForReaders,
  wikiReaderPaths,
} from "@/lib/public-wiki/reader-paths";
import {
  SEO_AUTHOR_NAME,
  SEO_AUTHOR_SAME_AS,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
} from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Wiki",
  description:
    "Search Andrew Davies' public, source-backed knowledge system across AI, strategy, security, infrastructure, markets, and decision-making.",
  alternates: { canonical: canonicalUrl("/wiki") },
  openGraph: {
    title: "Wiki · Crashboard",
    description:
      "Search Andrew Davies' public, source-backed knowledge system across AI, strategy, security, infrastructure, markets, and decision-making.",
    url: canonicalUrl("/wiki"),
    images: [{ url: SEO_DEFAULT_IMAGE, width: 1200, height: 630 }],
  },
};

export default function WikiPage() {
  const index = getPublicWikiIndex();
  const sourceNotes = index.pages.reduce(
    (sum, page) => sum + page.sourceNotes.length,
    0,
  );
  const linkedEdges = index.graph.edges.length;
  const clusterTotal = index.clusters.reduce((sum, item) => sum + item.count, 0);
  const clusterDistribution = sortClustersForReaders(index);
  const readerPaths = wikiReaderPaths.map((path) => ({
    ...path,
    primaryPage: getReaderPathPrimaryPage(path, index.pages),
    pages: getReaderPathPages(path, index.pages),
  }));
  const stats = [
    { label: "Pages", value: index.pages.length.toLocaleString() },
    { label: "Sources", value: sourceNotes.toLocaleString() },
    { label: "Links", value: linkedEdges.toLocaleString() },
    { label: "Domains", value: index.clusters.length.toLocaleString() },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:py-14">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": `${absoluteSiteUrl("/wiki")}#collection`,
              name: "Crashboard Wiki",
              url: absoluteSiteUrl("/wiki"),
              description:
                "A public, source-backed knowledge system across AI, strategy, security, infrastructure, markets, and decision-making.",
              inLanguage: "en-CA",
              author: {
                "@type": "Person",
                name: SEO_AUTHOR_NAME,
                url: absoluteSiteUrl("/about"),
                sameAs: SEO_AUTHOR_SAME_AS,
              },
              isPartOf: {
                "@type": "WebSite",
                name: SEO_SITE_NAME,
                url: absoluteSiteUrl("/"),
              },
              about: wikiReaderPaths.map((path) => ({
                "@type": "Thing",
                name: path.title,
                description: path.promise,
              })),
            },
            {
              "@type": "ItemList",
              "@id": `${absoluteSiteUrl("/wiki")}#pages`,
              name: "Crashboard wiki pages",
              numberOfItems: index.pages.length,
              itemListElement: index.pages.map((page, position) => ({
                "@type": "ListItem",
                position: position + 1,
                url: absoluteSiteUrl(`/wiki/${page.slug}`),
                name: page.title,
              })),
            },
            {
              "@type": "FAQPage",
              "@id": `${absoluteSiteUrl("/wiki")}#faq`,
              mainEntity: wikiAeoTargets.map((target) => ({
                "@type": "Question",
                name: target.question,
                acceptedAnswer: { "@type": "Answer", text: target.answer },
              })),
            },
          ],
        }}
      />

      <header className="grid gap-8 border-b border-border/80 pb-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <div>
          <p className="eyebrow flex items-center gap-3">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Public wiki
          </p>
          <h1 className="mt-4 max-w-4xl font-heading text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Search the public knowledge system.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Source-backed synthesis across AI systems, security, infrastructure,
            markets, work, health, policy, learning, and strategic judgment.
          </p>
          <p className="meta-tag mt-4 lg:hidden">
            {index.pages.length} pages · {sourceNotes} sources · {linkedEdges} links
          </p>
        </div>
        <dl className="hidden grid-cols-2 gap-px border border-border/80 bg-border/80 lg:grid">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card/70 p-4">
              <dt className="eyebrow">{stat.label}</dt>
              <dd className="mt-1 font-heading text-3xl font-semibold tabular-nums text-foreground">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="mt-8">
        <Suspense
          fallback={
            <div className="border border-border/80 bg-card/70 p-10 text-center text-sm text-muted-foreground">
              Loading the knowledge index...
            </div>
          }
        >
          <WikiExplorer index={index} readerPaths={readerPaths} />
        </Suspense>
      </section>

      <section className="mt-14 border-t border-border/80 pt-8" aria-labelledby="domain-heading">
        <div className="max-w-3xl">
          <p className="eyebrow">Coverage</p>
          <h2 id="domain-heading" className="mt-2 font-heading text-3xl font-semibold text-foreground">
            Published domains
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Distribution reflects the current public corpus and changes as new
            source-backed synthesis is exported.
          </p>
        </div>
        <div className="mt-6 grid gap-px border border-border/80 bg-border/80 sm:grid-cols-2 lg:grid-cols-4">
          {clusterDistribution.map((item) => {
            const percent =
              clusterTotal > 0 ? Math.round((item.count / clusterTotal) * 100) : 0;
            return (
              <div key={item.id} className="bg-card/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium leading-snug text-foreground">
                      {clusterLabel(item.id)}
                    </p>
                    <p className="meta-tag mt-1">{percent}% of pages</p>
                  </div>
                  <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
                    {item.count}
                  </p>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden bg-muted">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.max(percent, 3)}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
