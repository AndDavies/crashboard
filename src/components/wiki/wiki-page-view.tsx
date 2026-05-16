import Link from "next/link";
import Image from "next/image";
import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { WikiMarkdown } from "@/components/wiki/wiki-markdown";
import { WikiPageToc, WikiReadingProgress } from "@/components/wiki/wiki-page-toc";
import {
  getPageAnswerQuestion,
  getWikiAeoTargetsForPage,
} from "@/lib/public-wiki/aeo";
import type { PublicWikiIndex, PublicWikiPage } from "@/lib/public-wiki/types";

function label(input: string) {
  return input
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function WikiPageView({
  page,
  index,
}: {
  page: PublicWikiPage;
  index: PublicWikiIndex;
}) {
  const related = index.pages.filter((candidate) => page.linkedSlugs.includes(candidate.slug));
  const connectedIds = new Set([page.slug, ...page.linkedSlugs]);
  const graph = {
    nodes: index.graph.nodes.filter((node) => connectedIds.has(node.id)),
    edges: index.graph.edges.filter(
      (edge) => connectedIds.has(edge.source) && connectedIds.has(edge.target),
    ),
  };
  const answerQuestion = getPageAnswerQuestion(page);
  const answerTargets = getWikiAeoTargetsForPage(page).slice(0, 3);

  return (
    <article data-wiki-article className="mx-auto w-full min-w-0 max-w-7xl px-4 py-10 sm:px-6 md:py-14">
      <WikiReadingProgress />
      <SeoBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Wiki", href: "/wiki" },
          { label: page.title, href: `/wiki/${page.slug}` },
        ]}
      />

      <header className="grid min-w-0 gap-8 border-b border-border/80 pb-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap gap-2">
            <Badge variant="secondary">{label(page.cluster)}</Badge>
            <Badge variant="outline">{label(page.role)}</Badge>
            <Badge variant="outline">{page.readingMinutes} min read</Badge>
            <Badge variant="outline">{page.sourceNotes.length} source notes</Badge>
          </div>
          <h1 className="max-w-4xl break-words font-heading text-5xl leading-[0.98] font-light tracking-[-0.02em] text-foreground md:text-7xl">
            {page.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            {page.description}
          </p>
        </div>
        <div className="group/image technical-grid min-w-0 overflow-hidden border-y border-border/80 bg-card">
          <Image
            src={page.heroImage}
            alt=""
            width={1200}
            height={630}
            unoptimized
            priority
            className="aspect-[1.9/1] w-full object-cover opacity-85 grayscale transition-transform duration-500 group-hover/image:scale-[1.02]"
          />
        </div>
      </header>

      <div className="grid min-w-0 gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0">
          <section
            className={`mb-10 grid gap-px border-y border-border/80 bg-border/80 ${
              answerTargets.length > 0 ? "md:grid-cols-[minmax(0,1fr)_20rem]" : ""
            }`}
          >
            <div className="bg-card p-5">
              <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                Short answer
              </p>
              <h2 className="mt-3 font-heading text-2xl font-light text-foreground">
                {answerQuestion}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                {page.description}
              </p>
            </div>
            {answerTargets.length > 0 ? (
              <div className="bg-card p-5">
                <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
                  Supports
                </p>
                <div className="mt-3 space-y-3">
                  {answerTargets.map((target) => (
                    <Link
                      key={target.question}
                      href={`/wiki/${target.primarySlug}`}
                      className="block text-sm leading-relaxed text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    >
                      {target.question}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <WikiMarkdown markdown={page.markdown} charts={page.charts} />

          {related.length > 0 ? (
            <section className="mt-14 border-t border-border/80 pt-8">
              <h2 className="font-heading text-3xl font-light text-foreground">
                Related Pages
              </h2>
              <div className="mt-5 grid gap-px border-y border-border/80 bg-border/80 sm:grid-cols-2">
                {related.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/wiki/${item.slug}`}
                    className="group bg-card/70 p-4 transition-colors duration-300 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {label(item.cluster)}
                    </p>
                    <h3 className="mt-2 font-heading text-lg font-light text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {page.sourceNotes.length > 0 ? (
            <section className="mt-14 border-t border-border/80 pt-8">
              <h2 className="font-heading text-3xl font-light text-foreground">
                Source Notes
              </h2>
              <div className="mt-5 divide-y divide-border/70 border-y border-border/80 bg-card/60">
                {page.sourceNotes.map((note, index) => (
                  <div
                    key={`${note}-${index}`}
                    className="group/source flex gap-3 p-4 text-sm leading-relaxed text-muted-foreground transition-colors hover:bg-muted/35 hover:text-foreground"
                  >
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary/70 transition-transform group-hover/source:scale-150" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5 lg:sticky lg:top-24">
          <div className="border-y border-border/80 bg-card/70 py-4">
            <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
              Contents
            </p>
            <WikiPageToc headings={page.headings.filter((heading) => heading.level === 2 || heading.level === 3)} />
          </div>

          {graph.nodes.length > 1 ? (
            <WikiGraph
              nodes={graph.nodes}
              edges={graph.edges}
              compact
              focusedNodeId={page.slug}
              showSelectedPanel={false}
              showNodeList={false}
            />
          ) : null}

          <Link
            href="/wiki"
            className="flex items-center justify-between border-y border-border/80 bg-card/70 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Explore all pages
            <ExternalLinkIcon className="size-4" aria-hidden />
          </Link>
        </aside>
      </div>
    </article>
  );
}
