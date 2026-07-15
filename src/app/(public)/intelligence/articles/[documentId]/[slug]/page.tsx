import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { IntelligenceSectionNav } from "@/components/intelligence/intelligence-section-nav";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { getPublicIntelligenceDocument } from "@/lib/intelligence/public-data";
import { publicIntelligenceSlug } from "@/lib/intelligence/public";
import { canonicalUrl, compactDescription } from "@/lib/seo/metadata";

type Props = { params: Promise<{ documentId: string; slug: string }> };

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unknown";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" }).format(new Date(value));
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { documentId } = await params;
  const result = await getPublicIntelligenceDocument(decodeURIComponent(documentId));
  if (!result) return {};
  return {
    title: result.document.displayTitle,
    description: compactDescription(result.document.excerpt),
    alternates: { canonical: canonicalUrl(result.document.href) },
    robots: { index: false, follow: true },
  };
}

export default async function PublicIntelligenceArticlePage({ params }: Props) {
  const { documentId, slug } = await params;
  const result = await getPublicIntelligenceDocument(decodeURIComponent(documentId));
  if (!result) notFound();
  const canonicalSlug = publicIntelligenceSlug(result.document.title);
  if (slug !== canonicalSlug) redirect(result.document.href);
  const publisher = result.document.publisher ?? result.document.sourceFamily;
  const author = result.document.author?.trim();
  const showAuthor = Boolean(author && author.toLocaleLowerCase() !== publisher.toLocaleLowerCase());

  return (
    <MarketingPageFrame className="max-w-5xl">
      <SeoBreadcrumbs compactCurrent items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }, { label: "Sources", href: "/intelligence/articles" }, { label: result.document.displayTitle, href: result.document.href }]} />
      <IntelligenceSectionNav />
      <Link href="/intelligence/articles" className="link-accent inline-flex min-h-10 items-center gap-1 text-sm"><ArrowLeft className="size-4" /> Back to sources</Link>

      <article className="mt-8">
        <header className="border-b border-foreground pb-8">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{result.document.sourceType.replaceAll("_", " ")}</Badge><span className="text-xs text-muted-foreground">{formatDate(result.document.publishedAt)}</span></div>
          <h1 className="mt-4 font-heading text-4xl font-semibold leading-tight sm:text-5xl">{result.document.displayTitle}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{publisher}{showAuthor ? ` · ${author}` : ""}</p>
          {result.document.originalUrl ? <a href={result.document.originalUrl} target="_blank" rel="noopener noreferrer" className="cta-secondary mt-5">Open original source <ExternalLink className="size-4" /></a> : null}
        </header>

        <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <section>
            <p className="editorial-kicker">Retained excerpt</p>
            <p className="mt-4 whitespace-pre-line text-base leading-8 text-muted-foreground">{result.document.excerpt || "No public excerpt is available for this source."}</p>
            <p className="mt-6 border-l-2 border-border pl-4 text-xs leading-5 text-muted-foreground">This limited excerpt is retained to explain the source trail. Rights remain with the original publisher.</p>
          </section>

          <aside className="border-t border-foreground pt-5 lg:sticky lg:top-40" aria-label="Connected trends">
            <p className="editorial-kicker">Connected analysis</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold">Trends supported by this source</h2>
            {result.signals.length ? (
              <div className="mt-4 divide-y divide-border border-y border-border">
                {result.signals.slice(0, 5).map((signal) => (
                  <Link key={signal.id} href={signal.href} className="group block px-2 py-4 outline-none motion-safe:transition-colors hover:bg-card/80 focus-visible:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-heading text-xl font-semibold motion-safe:transition-colors group-hover:text-accent group-focus-visible:text-accent">{signal.label}</span>
                      <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
                    </span>
                    <span className="mt-1 block text-xs capitalize text-muted-foreground">{signal.kind}</span>
                    {signal.whyMatched ? <span className="mt-2 line-clamp-2 block text-sm leading-6 text-muted-foreground">{signal.whyMatched}</span> : null}
                  </Link>
                ))}
              </div>
            ) : <p className="mt-4 border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">This source is retained in the archive but is not linked to an active public trend.</p>}
            <Link href="/intelligence/explore" className="link-accent mt-5 inline-flex items-center gap-1 text-sm">Explore all trends <ArrowRight className="size-4" /></Link>
          </aside>
        </div>
      </article>
    </MarketingPageFrame>
  );
}
