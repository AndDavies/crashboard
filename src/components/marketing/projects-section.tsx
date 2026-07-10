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
      <div className="card-grid md:grid-cols-2 lg:grid-cols-3">
        {featuredPages.map((page) => (
          <Link
            key={page.slug}
            href={`/wiki/${page.slug}`}
            className="card-grid-cell group p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-heading text-xl leading-tight font-semibold text-foreground">
                {page.title}
              </h3>
              <ArrowRightIcon
                className="mt-1 size-4 text-muted-foreground motion-safe:transition-all motion-safe:group-hover:translate-x-1 group-hover:text-accent"
                aria-hidden
              />
            </div>
            <p className="mt-5 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
              {page.description}
            </p>
            <p className="meta-tag mt-5 inline-flex items-center gap-2">
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
    </SectionShell>
  );
}
