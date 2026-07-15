import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
    title: result.document.title,
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

  return (
    <MarketingPageFrame className="max-w-5xl">
      <SeoBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }, { label: "Sources", href: "/intelligence/articles" }, { label: result.document.title, href: result.document.href }]} />
      <Link href="/intelligence/articles" className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent"><ArrowLeft className="size-4" /> Back to sources</Link>

      <article className="mt-8">
        <header className="border-b border-foreground pb-8">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{result.document.sourceType.replaceAll("_", " ")}</Badge><span className="text-xs text-muted-foreground">{formatDate(result.document.publishedAt)}</span></div>
          <h1 className="mt-4 font-heading text-4xl font-semibold leading-tight sm:text-5xl">{result.document.title}</h1>
          <p className="mt-4 text-sm text-muted-foreground">{result.document.publisher ?? result.document.sourceFamily}{result.document.author ? ` · ${result.document.author}` : ""}</p>
          {result.document.originalUrl ? <a href={result.document.originalUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold hover:text-accent">Open original source <ExternalLink className="size-4" /></a> : null}
        </header>

        <section className="py-8">
          <p className="editorial-kicker">Retained excerpt</p>
          <p className="mt-4 whitespace-pre-line text-base leading-8 text-muted-foreground">{result.document.excerpt || "No public excerpt is available for this source."}</p>
          <p className="mt-6 border-l-2 border-border pl-4 text-xs leading-5 text-muted-foreground">This limited excerpt is retained to explain the source trail. Rights remain with the original publisher.</p>
        </section>
      </article>

      <section className="border-t border-foreground pt-8">
        <p className="editorial-kicker">Connected analysis</p>
        <h2 className="mt-2 font-heading text-3xl font-semibold">Trends supported by this source</h2>
        {result.signals.length ? (
          <div className="mt-5 divide-y divide-border border-y border-border">
            {result.signals.map((signal) => (
              <Link key={signal.id} href={signal.href} className="group block py-5">
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-heading text-2xl font-semibold group-hover:text-accent">{signal.label}</h3><span className="text-xs capitalize text-muted-foreground">{signal.kind}</span></div>
                {signal.whyMatched ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{signal.whyMatched}</p> : null}
                {signal.passage ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{signal.passage}</p> : null}
              </Link>
            ))}
          </div>
        ) : <p className="mt-5 border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">This source is retained in the archive but is not linked to an active public trend.</p>}
      </section>
    </MarketingPageFrame>
  );
}
