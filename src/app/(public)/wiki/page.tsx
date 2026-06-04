import type { Metadata } from "next";
import { WikiExplorer } from "@/components/wiki/wiki-explorer";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import {
  clusterLabel,
  getReaderPathPages,
  getReaderPathPrimaryPage,
  sortClustersForReaders,
  wikiReaderPaths,
} from "@/lib/public-wiki/reader-paths";
import { StructuredData } from "@/components/seo/structured-data";
import { wikiAeoTargets } from "@/lib/public-wiki/aeo";
import {
  SEO_AUTHOR_NAME,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
} from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Wiki",
  description:
    "A public web version of Andrew Davies' compiled wiki: source-backed notes, concepts, workflows, and synthesis.",
  alternates: { canonical: canonicalUrl("/wiki") },
  openGraph: {
    title: "Wiki · Crashboard",
    description:
      "A public web version of Andrew Davies' compiled wiki: source-backed notes, concepts, workflows, and synthesis.",
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
  const stats: Array<{ label: string; value: string; hint: string }> = [
    {
      label: "Pages",
      value: index.pages.length.toLocaleString(),
      hint: "Public synthesis",
    },
    {
      label: "Sources",
      value: sourceNotes.toLocaleString(),
      hint: "Cited notes",
    },
    {
      label: "Links",
      value: linkedEdges.toLocaleString(),
      hint: "Internal connections",
    },
    {
      label: "Domains",
      value: index.clusters.length.toLocaleString(),
      hint: "Cluster map",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
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
                "A public web version of Andrew Davies' compiled wiki: source-backed notes, concepts, workflows, and synthesis.",
              inLanguage: "en",
              author: { "@type": "Person", name: SEO_AUTHOR_NAME },
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
              itemListElement: index.pages.map((page, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: absoluteSiteUrl(`/wiki/${page.slug}`),
                name: page.title,
              })),
            },
            {
              "@type": "BreadcrumbList",
              "@id": `${absoluteSiteUrl("/wiki")}#breadcrumb`,
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
              ],
            },
            {
              "@type": "FAQPage",
              "@id": `${absoluteSiteUrl("/wiki")}#faq`,
              mainEntity: wikiAeoTargets.map((target) => ({
                "@type": "Question",
                name: target.question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: target.answer,
                },
              })),
            },
          ],
        }}
      />
      <section className="technical-grid -mx-4 grid gap-10 border-b border-border/80 bg-card px-4 py-16 sm:-mx-6 sm:px-6 md:py-24 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Public wiki
          </p>
          <h1 className="mt-4 max-w-4xl font-heading text-5xl font-semibold leading-[0.98] tracking-[-0.02em] text-foreground md:text-7xl">
            Choose a path through my public knowledge system.
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            This wiki turns private Obsidian notes into public, source-backed
            synthesis across work, health, money, policy, AI systems,
            communication, learning, and philosophy.
          </p>
        </div>
        <dl className="grid gap-px border border-border/80 bg-border/80">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-baseline justify-between gap-4 bg-background/80 px-5 py-4"
            >
              <div>
                <dt className="eyebrow">{stat.label}</dt>
                <p className="meta-tag mt-2">{stat.hint}</p>
              </div>
              <dd className="font-heading text-4xl font-semibold tabular-nums text-foreground md:text-5xl">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Pick a path, read the synthesis, then follow trails into related pages
        and source-backed context.
      </p>

      <section className="mt-10 border border-border/80 bg-card/70">
        <div className="grid gap-px bg-border/80 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.45fr)]">
          <div className="bg-background/90 p-5 md:p-6">
            <p className="eyebrow">Cluster distribution</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-foreground">
              What the published wiki currently emphasizes.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              These domains come directly from each page&apos;s `kb_cluster`
              frontmatter during `/kb-publish`; the trails below are curated
              entry routes through the same exported data.
            </p>
          </div>
          <div className="grid gap-px bg-border/80 md:grid-cols-2">
            {clusterDistribution.map((item) => {
              const percent =
                clusterTotal > 0 ? Math.round((item.count / clusterTotal) * 100) : 0;
              return (
                <div key={item.id} className="bg-background/90 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="meta-tag">{item.id}</p>
                      <h3 className="mt-1 text-sm font-semibold leading-snug text-foreground">
                        {clusterLabel(item.id)}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="font-heading text-2xl font-semibold tabular-nums text-foreground">
                        {item.count}
                      </p>
                      <p className="meta-tag">{percent}%</p>
                    </div>
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
        </div>
      </section>

      <section className="mt-10">
        <WikiExplorer index={index} readerPaths={readerPaths} />
      </section>
    </div>
  );
}
