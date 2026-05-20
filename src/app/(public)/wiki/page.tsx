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
  const sourceNotes = index.pages.reduce((sum, page) => sum + page.sourceNotes.length, 0);
  const linkedEdges = index.graph.edges.length;
  const readerPaths = wikiReaderPaths.map((path) => ({
    ...path,
    primaryPage: getReaderPathPrimaryPage(path, index.pages),
    pages: getReaderPathPages(path, index.pages),
  }));

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
      <section className="technical-grid -mx-4 grid gap-10 border-b border-border/80 bg-card px-4 py-16 sm:-mx-6 sm:px-6 md:py-24 lg:grid-cols-[1fr_28rem] lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Public wiki
          </p>
          <h1 className="mt-8 max-w-4xl font-heading text-5xl leading-[0.98] font-light tracking-[-0.02em] text-foreground md:text-7xl">
            Choose a path through my public knowledge system.
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            This wiki turns private Obsidian notes into public, source-backed
            synthesis on AI workflows, knowledge systems, strategy, and venture
            judgment.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Pages", index.pages.length.toLocaleString()],
            ["Sources", sourceNotes.toLocaleString()],
            ["Links", linkedEdges.toLocaleString()],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-y border-border/80 bg-background/80 p-4"
            >
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {label}
              </p>
              <p className="mt-3 font-heading text-4xl font-light text-foreground">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border/80 py-8">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ["Pick a path", "Start with the question closest to what you need."],
            ["Read the synthesis", "Use the page summary before the long-form notes."],
            ["Follow trails", "Move through related pages and source-backed context."],
          ].map(([title, text]) => (
            <div key={title} className="border-y border-border/80 bg-card/70 p-4">
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10">
        <WikiExplorer index={index} readerPaths={readerPaths} />
      </section>
    </div>
  );
}
