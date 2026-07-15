import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { listPublicIntelligenceDocuments } from "@/lib/intelligence/public-data";
import { canonicalUrl } from "@/lib/seo/metadata";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unknown";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: "Intelligence Sources",
    description: "Browse the source summaries supporting Crashboard's public trend intelligence.",
    alternates: { canonical: canonicalUrl("/intelligence/articles") },
    robots: first(params.before) ? { index: false, follow: true } : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function PublicIntelligenceArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const before = (first(params.before) ?? "").trim() || null;
  const documents = await listPublicIntelligenceDocuments({ limit: 40, before });
  const next = documents.at(-1)?.publishedAt ?? null;

  return (
    <MarketingPageFrame>
      <SeoBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }, { label: "Sources", href: "/intelligence/articles" }]} />
      <nav className="mb-9 flex flex-wrap gap-3 border-y border-border py-3 text-sm" aria-label="Intelligence">
        <Link href="/intelligence" className="font-semibold hover:text-accent">Overview</Link>
        <Link href="/intelligence/explore" className="font-semibold hover:text-accent">Explore trends</Link>
        <Link href="/intelligence/articles" className="font-semibold text-accent" aria-current="page">Browse sources</Link>
      </nav>

      <header className="border-b border-foreground pb-8">
        <p className="editorial-kicker">Intelligence / sources</p>
        <h1 className="mt-3 max-w-4xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">The evidence behind the trends.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">Browse the monitored articles, newsletters, releases, and other source material retained for analysis. Each page shows a limited excerpt and the trends it supports.</p>
      </header>

      {documents.length ? (
        <ol className="divide-y divide-border border-b border-border">
          {documents.map((document) => (
            <li key={document.id}>
              <Link href={document.href} className="group grid gap-4 py-6 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                <div><p className="text-xs text-muted-foreground">{formatDate(document.publishedAt)}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{document.sourceType.replaceAll("_", " ")}</p></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{document.publisher ?? document.sourceFamily}</p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold group-hover:text-accent">{document.title}</h2>
                  {document.excerpt ? <p className="mt-3 line-clamp-3 max-w-3xl text-sm leading-6 text-muted-foreground">{document.excerpt}</p> : null}
                </div>
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      ) : <p className="border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">No public source summaries are available yet.</p>}

      {next && documents.length === 40 ? (
        <div className="mt-8 flex justify-center"><Link href={`/intelligence/articles?before=${encodeURIComponent(next)}`} rel="next" className="border border-foreground px-5 py-2.5 text-sm font-semibold hover:bg-foreground hover:text-background">Older sources</Link></div>
      ) : null}
    </MarketingPageFrame>
  );
}
