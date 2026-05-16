import type { Metadata } from "next";
import Link from "next/link";
import { WikiExplorer } from "@/components/wiki/wiki-explorer";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { getWikiAeoTargetPages, wikiAeoTargets } from "@/lib/public-wiki/aeo";
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
  const answerTargets = wikiAeoTargets.map((target) => ({
    ...target,
    pages: getWikiAeoTargetPages(target, index.pages),
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
          about: wikiAeoTargets.map((target) => ({
            "@type": "Thing",
            name: target.topic,
            description: target.question,
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
            A compiled map of what I am learning.
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-8 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            This is the public web version of my LLM-maintained wiki: source-backed
            pages, recurring concepts, operating models, and links between ideas.
            The raw evidence stays private; the synthesis is here to browse.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-px border-y border-border/80 bg-border/80">
          {[
            ["Pages", index.pages.length.toLocaleString()],
            ["Sources", sourceNotes.toLocaleString()],
            ["Links", linkedEdges.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="bg-background p-4">
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

      <section className="border-b border-border/80 py-10">
        <div className="mb-6 max-w-3xl">
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Answer targets
          </p>
          <h2 className="mt-3 font-heading text-3xl font-light text-foreground">
            Questions this wiki is built to answer.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            These are the clearest public entry points for readers, search, and
            answer systems. Each path links a direct answer page with supporting
            wiki context.
          </p>
        </div>
        <div className="grid gap-px border-y border-border/80 bg-border/80 md:grid-cols-2 xl:grid-cols-3">
          {answerTargets.map((target) => (
            <article key={target.question} className="bg-card p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {target.topic}
              </p>
              <h3 className="mt-3 font-heading text-2xl leading-tight font-light text-foreground">
                {target.question}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {target.answer}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {target.pages.map((page) => (
                  <Link
                    key={page.slug}
                    href={`/wiki/${page.slug}`}
                    className="rounded-full border border-border/80 bg-background/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {page.title}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="py-10">
        <WikiExplorer index={index} />
      </section>
    </div>
  );
}
