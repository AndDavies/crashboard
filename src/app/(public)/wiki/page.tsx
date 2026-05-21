import type { Metadata } from "next";
import { WikiExplorer } from "@/components/wiki/wiki-explorer";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import {
  getReaderPathPages,
  getReaderPathPrimaryPage,
  wikiReaderPaths,
} from "@/lib/public-wiki/reader-paths";
import { StructuredData } from "@/components/seo/structured-data";
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
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Crashboard Wiki",
          url: absoluteSiteUrl("/wiki"),
          description:
            "A public web version of Andrew Davies' compiled wiki: source-backed notes, concepts, workflows, and synthesis.",
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
        }}
      />
      <section className="technical-grid -mx-4 grid gap-10 border-b border-border/80 bg-card px-4 py-16 sm:-mx-6 sm:px-6 md:py-24 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Public wiki
          </p>
          <h1 className="mt-4 max-w-4xl font-heading text-5xl font-light leading-[0.98] tracking-[-0.02em] text-foreground md:text-7xl">
            Choose a path through my public knowledge system.
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            This wiki turns private Obsidian notes into public, source-backed
            synthesis on AI workflows, knowledge systems, strategy, and venture
            judgment.
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
              <dd className="font-heading text-4xl font-light tabular-nums text-foreground md:text-5xl">
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

      <section className="mt-10">
        <WikiExplorer index={index} readerPaths={readerPaths} />
      </section>
    </div>
  );
}
