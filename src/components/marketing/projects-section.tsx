import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function ProjectsSection() {
  const index = getPublicWikiIndex();
  const featuredPages = index.pages.slice(0, 6);

  return (
    <SectionShell id="wiki" className="bg-muted/35">
      <SectionHeading
        eyebrow="Wiki"
        title="The real public content lives in the wiki."
        description="These pages are generated from the compiled knowledge base and link to real public routes."
      />
      <div className="grid gap-px border-y border-border/80 bg-border/80 md:grid-cols-2 lg:grid-cols-3">
        {featuredPages.map((page) => (
          <Link
            key={page.slug}
            href={`/wiki/${page.slug}`}
            className="group bg-background p-6 outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-heading text-xl leading-tight font-light text-foreground">
                {page.title}
              </h3>
              <ArrowRightIcon
                className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </div>
            <p className="mt-5 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
              {page.description}
            </p>
          </Link>
        ))}
      </div>
      <Link
        href="/wiki"
        className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        Browse all {index.pages.length} wiki pages
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </SectionShell>
  );
}
