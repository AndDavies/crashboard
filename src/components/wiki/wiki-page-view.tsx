import Link from "next/link";
import Image from "next/image";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ClockIcon,
  CompassIcon,
  StarIcon,
} from "lucide-react";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { WikiMarkdown } from "@/components/wiki/wiki-markdown";
import { WikiPageToc, WikiReadingProgress } from "@/components/wiki/wiki-page-toc";
import { deriveWikiArticleSummary } from "@/lib/public-wiki/article-summary";
import {
  getPageAnswerQuestion,
  getWikiAeoTargetsForPage,
} from "@/lib/public-wiki/aeo";
import { clusterLabel } from "@/lib/public-wiki/reader-paths";
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
  const articleSummary = deriveWikiArticleSummary(page, index);

  return (
    <article
      data-wiki-article
      className="mx-auto w-full min-w-0 max-w-7xl px-4 py-10 sm:px-6 md:py-14"
    >
      <WikiReadingProgress />
      <SeoBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Wiki", href: "/wiki" },
          { label: page.title, href: `/wiki/${page.slug}` },
        ]}
      />

      <header className="grid min-w-0 gap-8 border-b border-border/80 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          <p className="eyebrow flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{clusterLabel(page.cluster)}</span>
            <span aria-hidden>·</span>
            <span>{label(page.role)}</span>
            <span aria-hidden>·</span>
            <span>{page.readingMinutes} min read</span>
            <span aria-hidden>·</span>
            <span>{page.sourceNotes.length} sources</span>
          </p>
          <h1 className="mt-5 max-w-4xl break-words font-heading text-5xl font-light leading-[0.98] tracking-[-0.02em] text-foreground md:text-7xl">
            {page.title}
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            {page.description}
          </p>
        </div>
        <div className="group/image technical-grid min-w-0 overflow-hidden border border-border/80 bg-card">
          <Image
            src={page.heroImage}
            alt=""
            width={1200}
            height={630}
            unoptimized
            priority
            className="aspect-[1.9/1] w-full object-cover opacity-85 grayscale motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover/image:scale-[1.02]"
          />
        </div>
      </header>

      <div className="grid min-w-0 gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="min-w-0">
          <ArticleSummaryBlock
            answerQuestion={answerQuestion}
            answerTargets={answerTargets}
            pageDescription={page.description}
            summary={articleSummary}
          />

          <WikiMarkdown markdown={page.markdown} charts={page.charts} />

          {related.length > 0 ? (
            <section id="related-pages" className="mt-14 border-t border-border/80 pt-8">
              <p className="eyebrow">Related</p>
              <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
                Related Pages
              </h2>
              <div className="mt-6 grid gap-px border border-border/80 bg-border/80 sm:grid-cols-2">
                {related.map((item) => (
                  <Link
                    key={item.slug}
                    href={`/wiki/${item.slug}`}
                    className="group flex flex-col bg-card/70 p-5 motion-safe:transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="eyebrow">{clusterLabel(item.cluster)}</p>
                    <h3 className="mt-3 font-heading text-lg font-light text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                      Read
                      <ArrowRightIcon
                        className="size-3.5 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {page.sourceNotes.length > 0 ? (
            <section className="mt-14 border-t border-border/80 pt-8">
              <p className="eyebrow">Evidence</p>
              <h2 className="mt-2 font-heading text-3xl font-light text-foreground">
                Source Notes
              </h2>
              <ol className="mt-6 grid gap-px border border-border/80 bg-border/80">
                {page.sourceNotes.map((note, sourceIndex) => (
                  <li
                    key={`${note}-${sourceIndex}`}
                    className="group/source flex items-start gap-4 bg-card/70 p-4 motion-safe:transition-colors hover:bg-card"
                  >
                    <span className="ordinal mt-0.5">
                      S{String(sourceIndex + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed text-muted-foreground group-hover/source:text-foreground">
                      {note}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside
          className="min-w-0 space-y-5 lg:sticky lg:top-24"
          aria-label="Article navigation"
        >
          <div className="border border-border/80 bg-card/70 p-4">
            <p className="eyebrow">Contents</p>
            <WikiPageToc
              headings={page.headings.filter(
                (heading) => heading.level === 2 || heading.level === 3,
              )}
            />
          </div>

          {graph.nodes.length > 1 ? (
            <section className="border border-border/80 bg-card/70" aria-label="Page neighborhood">
              <div className="border-b border-border/80 px-4 py-3">
                <p className="eyebrow">Page map</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  A small neighborhood around this page.
                </p>
              </div>
              <div className="overflow-x-auto">
                <WikiGraph
                  nodes={graph.nodes}
                  edges={graph.edges}
                  compact
                  focusedNodeId={page.slug}
                  showSelectedPanel={false}
                  showNodeList={false}
                />
              </div>
            </section>
          ) : null}

          <Link
            href="/wiki"
            className="flex items-center justify-between border border-border/80 bg-card/70 px-4 py-3 text-sm font-medium text-muted-foreground motion-safe:transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            Explore all pages
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </aside>
      </div>
    </article>
  );
}

function ArticleSummaryBlock({
  answerQuestion,
  answerTargets,
  pageDescription,
  summary,
}: {
  answerQuestion: string;
  answerTargets: ReturnType<typeof getWikiAeoTargetsForPage>;
  pageDescription: string;
  summary: ReturnType<typeof deriveWikiArticleSummary>;
}) {
  return (
    <section className="mb-10 grid gap-px border border-border/80 bg-border/80 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col bg-card/80 p-5">
        <p className="eyebrow">What to use this for</p>
        <h2 className="mt-3 font-heading text-2xl font-light text-foreground">
          {answerQuestion}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {pageDescription}
        </p>
        <div className="mt-6 border-t border-border/80 pt-5">
          <p className="eyebrow">3 key takeaways</p>
          <ul className="mt-3 space-y-3">
            {summary.keyTakeaways.map((takeaway) => (
              <li
                key={takeaway}
                className="flex gap-3 text-sm leading-relaxed text-muted-foreground"
              >
                <span
                  className="mt-2 size-1.5 shrink-0 bg-accent"
                  aria-hidden
                />
                <span>{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-px bg-border/80">
        <SummaryFact
          icon={<StarIcon className="size-3.5" aria-hidden />}
          label="Best for"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.bestFor}
          </p>
        </SummaryFact>
        <SummaryFact
          icon={<CompassIcon className="size-3.5" aria-hidden />}
          label="Related next read"
        >
          {summary.relatedNextRead ? (
            <Link
              href={`/wiki/${summary.relatedNextRead.slug}`}
              className="block font-heading text-lg font-light leading-tight text-foreground underline decoration-accent decoration-2 underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {summary.relatedNextRead.title}
            </Link>
          ) : (
            <Link
              href="#related-pages"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
            >
              See related pages
              <ArrowRightIcon className="size-3.5" aria-hidden />
            </Link>
          )}
        </SummaryFact>
        <SummaryFact
          icon={<BookOpenIcon className="size-3.5" aria-hidden />}
          label="Source backing"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary.sourceBacking}
          </p>
        </SummaryFact>
        {answerTargets.length > 0 ? (
          <SummaryFact
            icon={<ClockIcon className="size-3.5" aria-hidden />}
            label="Supports"
          >
            <ul className="space-y-2">
              {answerTargets.map((target) => (
                <li key={target.question}>
                  <Link
                    href={`/wiki/${target.primarySlug}`}
                    className="block text-sm leading-relaxed text-muted-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
                  >
                    {target.question}
                  </Link>
                </li>
              ))}
            </ul>
          </SummaryFact>
        ) : null}
      </div>

    </section>
  );
}

function SummaryFact({
  children,
  icon,
  label: labelText,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="bg-card/70 p-4">
      <p className="eyebrow flex items-center gap-1.5">
        {icon}
        {labelText}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
