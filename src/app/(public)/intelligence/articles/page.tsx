import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { IntelligenceSectionNav } from "@/components/intelligence/intelligence-section-nav";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import {
  listPublicIntelligenceDocumentFacets,
  listPublicIntelligenceDocuments,
} from "@/lib/intelligence/public-data";
import { canonicalUrl } from "@/lib/seo/metadata";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type SourceSort = "newest" | "oldest";
type SourcePeriod = "all" | "30d" | "90d" | "180d" | "365d";

const PAGE_SIZE = 24;
const PERIODS = new Set<SourcePeriod>(["all", "30d", "90d", "180d", "365d"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Date unknown";
  return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (character) => character.toUpperCase());
}

function periodStart(period: SourcePeriod) {
  if (period === "all") return null;
  const days = Number.parseInt(period, 10);
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function browseHref(input: {
  query: string;
  sourceType: string;
  sourceFamily: string;
  period: SourcePeriod;
  sort: SourceSort;
  page: number;
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.sourceType) params.set("type", input.sourceType);
  if (input.sourceFamily) params.set("source", input.sourceFamily);
  if (input.period !== "all") params.set("period", input.period);
  if (input.sort !== "newest") params.set("sort", input.sort);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return `/intelligence/articles${query ? `?${query}` : ""}`;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const hasQuery = Object.values(params).some((value) => value !== undefined && value !== "");
  return {
    title: "Intelligence Sources",
    description: "Browse the source summaries supporting Crashboard's public trend intelligence.",
    alternates: { canonical: canonicalUrl("/intelligence/articles") },
    robots: hasQuery ? { index: false, follow: true } : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function PublicIntelligenceArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, 160);
  const sourceType = (first(params.type) ?? "").trim().slice(0, 80);
  const sourceFamily = (first(params.source) ?? "").trim().slice(0, 160);
  const periodValue = (first(params.period) ?? "all") as SourcePeriod;
  const period = PERIODS.has(periodValue) ? periodValue : "all";
  const sort: SourceSort = first(params.sort) === "oldest" ? "oldest" : "newest";
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 500)) : 1;
  const current = { query, sourceType, sourceFamily, period, sort, page };
  const [documentBatch, facets] = await Promise.all([
    listPublicIntelligenceDocuments({
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
      after: periodStart(period),
      query: query || undefined,
      sourceType: sourceType || undefined,
      sourceFamily: sourceFamily || undefined,
      sort,
    }),
    listPublicIntelligenceDocumentFacets(),
  ]);
  const hasNext = documentBatch.length > PAGE_SIZE;
  const documents = documentBatch.slice(0, PAGE_SIZE);
  const hasFilters = Boolean(query || sourceType || sourceFamily || period !== "all" || sort !== "newest");

  return (
    <MarketingPageFrame>
      <SeoBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }, { label: "Sources", href: "/intelligence/articles" }]} />
      <IntelligenceSectionNav />

      <header className="border-b border-foreground pb-8">
        <p className="editorial-kicker">Intelligence / sources</p>
        <h1 className="mt-3 max-w-4xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">The evidence behind the trends.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">Browse the monitored articles, newsletters, releases, and other source material retained for analysis. Each page shows a limited excerpt and the trends it supports.</p>
      </header>

      <section className="border-b border-border py-6" aria-label="Source archive filters">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold">Find a source</h2>
          {hasFilters ? <Link href="/intelligence/articles" className="link-accent ml-auto text-xs">Clear filters</Link> : null}
        </div>
        <form action="/intelligence/articles" className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.4fr)_minmax(10rem,0.8fr)_minmax(10rem,0.9fr)_minmax(8rem,0.65fr)_minmax(8rem,0.65fr)_auto]">
          <label className="grid gap-1.5 text-xs font-semibold" htmlFor="source-query">
            Search
            <span className="flex h-10 items-center border border-input bg-background px-3 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <Search className="mr-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input id="source-query" name="q" defaultValue={query} placeholder="Title, organization, system…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold" htmlFor="source-type">
            Type
            <select id="source-type" name="type" defaultValue={sourceType} className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
              <option value="">All types</option>
              {facets.sourceTypes.map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold" htmlFor="source-family">
            Publisher
            <select id="source-family" name="source" defaultValue={sourceFamily} className="h-10 min-w-0 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
              <option value="">All publishers</option>
              {facets.sourceFamilies.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold" htmlFor="source-period">
            Date
            <select id="source-period" name="period" defaultValue={period} className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
              <option value="all">Any time</option>
              <option value="30d">Past month</option>
              <option value="90d">Past 3 months</option>
              <option value="180d">Past 6 months</option>
              <option value="365d">Past year</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold" htmlFor="source-sort">
            Sort
            <select id="source-sort" name="sort" defaultValue={sort} className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button type="submit" className="cta-primary mt-auto h-10 px-4 py-0">Apply</button>
        </form>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 text-xs text-muted-foreground">
        <p>{documents.length ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + documents.length}` : "No sources found"}</p>
        <p>Page {page}</p>
      </div>

      {documents.length ? (
        <ol className="divide-y divide-border border-b border-border">
          {documents.map((document) => (
            <li key={document.id}>
              <Link href={document.href} className="group grid gap-4 px-2 py-6 outline-none motion-safe:transition-colors hover:bg-card/80 focus-visible:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                <div><p className="text-xs text-muted-foreground">{formatDate(document.publishedAt)}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{document.sourceType.replaceAll("_", " ")}</p></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{document.publisher ?? document.sourceFamily}</p>
                  <h2 className="mt-2 font-heading text-2xl font-semibold motion-safe:transition-colors group-hover:text-accent group-focus-visible:text-accent">{document.displayTitle}</h2>
                  {document.excerpt ? <p className="mt-3 line-clamp-3 max-w-3xl text-sm leading-6 text-muted-foreground">{document.excerpt}</p> : null}
                  {document.signals.length ? (
                    <div className="mt-4 flex flex-wrap gap-2" aria-label="Related trends">
                      {document.signals.map((signal) => <span key={signal.id} className="border border-border bg-background px-2 py-1 text-[11px] font-semibold">{signal.label}</span>)}
                    </div>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-1 self-start text-xs font-semibold text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground">Open <ArrowRight className="size-4" aria-hidden /></span>
              </Link>
            </li>
          ))}
        </ol>
      ) : <div className="border-b border-dashed border-border px-6 py-16 text-center"><p className="text-sm text-muted-foreground">No public source summaries match these filters.</p>{hasFilters ? <Link href="/intelligence/articles" className="link-accent mt-4 inline-flex text-sm">Clear filters and browse everything</Link> : null}</div>}

      <nav className="mt-8 flex items-center justify-between gap-4" aria-label="Source archive pages">
        {page > 1 ? <Link href={browseHref({ ...current, page: page - 1 })} rel="prev" className="cta-secondary"><ArrowLeft className="size-4" aria-hidden /> Previous</Link> : <span />}
        {hasNext ? <Link href={browseHref({ ...current, page: page + 1 })} rel="next" className="cta-primary">Next <ArrowRight className="size-4" aria-hidden /></Link> : null}
      </nav>
    </MarketingPageFrame>
  );
}
