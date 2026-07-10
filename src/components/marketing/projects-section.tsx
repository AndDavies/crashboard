import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { clusterLabel } from "@/lib/public-wiki/reader-paths";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function ProjectsSection() {
  const index = getPublicWikiIndex();
  const featuredPages = index.pages.slice(0, 6);

  return (
    <SectionShell id="wiki">
      <SectionHeading
        eyebrow="Wiki"
        title="The real public content lives in the wiki."
        description="These pages are generated from the compiled knowledge base and link to real public routes."
      />
      <div className="border-y border-foreground/80">
        {featuredPages.map((page) => (
          <Link
            key={page.slug}
            href={`/wiki/${page.slug}`}
            className="group grid gap-4 border-b border-border/80 py-5 last:border-b-0 md:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1fr)_auto] md:items-center"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-heading text-2xl leading-tight font-semibold text-foreground">
                {page.title}
              </h3>
              <ArrowRightIcon
                className="mt-1 size-4 text-muted-foreground motion-safe:transition-all motion-safe:group-hover:translate-x-1 group-hover:text-accent"
                aria-hidden
              />
            </div>
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {page.description}
            </p>
            <p className="meta-tag inline-flex items-center gap-2 md:justify-end">
              {clusterLabel(page.cluster)}
              <span aria-hidden>·</span>
              {page.role}
            </p>
          </Link>
        ))}
      </div>
      <Link
        href="/wiki"
        className="group mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent underline decoration-accent/40 decoration-2 underline-offset-4 hover:decoration-accent"
      >
        Browse all {index.pages.length} wiki pages
        <ArrowRightIcon
          className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
          aria-hidden
        />
      </Link>

      <div className="mt-14 border-t border-foreground/80 pt-8 md:flex md:items-end md:justify-between md:gap-10">
        <div className="max-w-2xl">
          <p className="eyebrow">Next</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold leading-tight text-foreground md:text-4xl">
            Start with the material that already has weight.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            The wiki is live now. The blog carries the longer essays and daily briefs as the archive grows.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 md:mt-0">
          <Link href="/wiki" className="cta-primary">Public wiki <ArrowRightIcon className="size-4" aria-hidden /></Link>
          <Link href="/blog" className="cta-secondary">Open blog <ArrowRightIcon className="size-4" aria-hidden /></Link>
        </div>
      </div>
    </SectionShell>
  );
}
