import type { Metadata } from "next";
import { ExploreWorkspace } from "@/components/dashboard/intelligence/explore-workspace";
import { IntelligenceSectionNav } from "@/components/intelligence/intelligence-section-nav";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { getPublicIntelligenceUiData } from "@/lib/intelligence/public-data";
import { canonicalUrl } from "@/lib/seo/metadata";

const LENSES = new Set(["all", "defence", "ai", "cyber", "canada-allies"]);
const KINDS = new Set(["all", "topic", "keyword", "organization", "system"]);
const RANGES = new Set(["30d", "90d", "180d", "365d"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const hasQuery = Object.values(params).some((value) => value !== undefined && value !== "");
  return {
    title: "Explore Trends",
    description: "Search and compare evidence-backed topics, keywords, organizations, programmes, and systems.",
    alternates: { canonical: canonicalUrl("/intelligence/explore") },
    robots: hasQuery ? { index: false, follow: true } : undefined,
  };
}

export const dynamic = "force-dynamic";

export default async function PublicExplorePage({ searchParams }: Props) {
  const params = await searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, 240);
  const lensValue = first(params.lens) ?? "all";
  const kindValue = first(params.kind) ?? "all";
  const rangeValue = first(params.range) ?? "90d";
  const compare = (first(params.compare) ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 5);
  const requestedSignal = (first(params.signal) ?? "").trim();
  const lens = (LENSES.has(lensValue) ? lensValue : "all") as "all" | "defence" | "ai" | "cyber" | "canada-allies";
  const kind = (KINDS.has(kindValue) ? kindValue : "all") as "all" | "topic" | "keyword" | "organization" | "system";
  const range = (RANGES.has(rangeValue) ? rangeValue : "90d") as "30d" | "90d" | "180d" | "365d";
  const loadComparison = q ? [] : [...new Set([requestedSignal, ...compare].filter(Boolean))].slice(0, 5);
  const data = await getPublicIntelligenceUiData({ range, lens, kind, q: q || undefined, compare: loadComparison });
  const resolvedRequestedSignal = !q && requestedSignal ? data.resolvedSignalIds[0] ?? requestedSignal : undefined;
  const resolvedCompare = q ? [] : requestedSignal ? data.resolvedSignalIds.slice(1) : data.resolvedSignalIds;

  return (
    <MarketingPageFrame>
      <SeoBreadcrumbs items={[{ label: "Home", href: "/" }, { label: "Intelligence", href: "/intelligence" }, { label: "Explore", href: "/intelligence/explore" }]} />
      <IntelligenceSectionNav />
      <ExploreWorkspace
        key={[lens, kind, range, q, requestedSignal, compare.join(",")].join(":")}
        signals={data.signals}
        listedSignalIds={data.listedSignalIds}
        searchResults={data.searchResults}
        initialLens={lens}
        initialKind={kind}
        initialRange={range}
        initialQuery={q}
        initialSignalId={resolvedRequestedSignal}
        initialCompare={resolvedCompare}
        dataStatus={data.dataStatus}
        usesLegacyFallback={data.usesLegacyFallback}
        basePath="/intelligence/explore"
        researchEnabled={false}
      />
    </MarketingPageFrame>
  );
}
