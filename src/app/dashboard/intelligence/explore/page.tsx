import type { Metadata } from "next";
import { ExploreWorkspace } from "@/components/dashboard/intelligence/explore-workspace";
import { getIntelligenceUiData } from "@/components/dashboard/intelligence/intelligence-ui-data";

export const metadata: Metadata = {
  title: "Explore · Crashboard Intelligence",
  description: "Compare intelligence signals and inspect their supporting evidence.",
};
export const dynamic = "force-dynamic";

const LENSES = new Set(["all", "defence", "ai", "cyber", "canada-allies"]);
const KINDS = new Set(["all", "topic", "keyword", "organization", "system"]);
const RANGES = new Set(["30d", "90d", "180d", "365d"]);

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const loadComparison = [...new Set([requestedSignal, ...compare].filter(Boolean))].slice(0, 5);
  const data = await getIntelligenceUiData({
    range,
    lens,
    kind,
    q: q || undefined,
    compare: loadComparison,
  });

  return (
    <ExploreWorkspace
      key={[lens, kind, range, q, requestedSignal, compare.join(",")].join(":")}
      signals={data.signals}
      listedSignalIds={data.listedSignalIds}
      searchResults={data.searchResults}
      initialLens={lens}
      initialKind={kind}
      initialRange={range}
      initialQuery={q}
      initialSignalId={requestedSignal || undefined}
      initialCompare={compare}
      dataStatus={data.dataStatus}
      usesLegacyFallback={data.usesLegacyFallback}
    />
  );
}
