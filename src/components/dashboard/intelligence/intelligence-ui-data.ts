import "server-only";

import type { ExploreSearchResult } from "./explore-workspace";
import type { CompletedResearchItem } from "./intelligence-overview";
import {
  toTrendSignals,
  v2SignalsToUi,
  type TrendSignal,
} from "./trend-ui-model";
import { searchIntelligenceDocuments } from "@/lib/intelligence/data";
import { requireDashboardUser } from "@/lib/blog/data";
import {
  searchIntelligenceV2,
  type IntelligenceCatalogMatch,
  type IntelligenceSearchResult,
} from "@/lib/intelligence/hybrid-search-v2";
import {
  getIntelligenceSignals,
  type GetIntelligenceSignalsOptions,
} from "@/lib/intelligence/signals-v2";
import { getTrendingAnalysis } from "@/lib/intelligence/trending-data";
import { catalogMatchHref } from "@/lib/intelligence/catalog-profile";
import { loadResearchCompletedSinceLastBrief } from "@/lib/intelligence/research-completions";
import { createAdminClient } from "@/lib/supabase/admin";

export type IntelligenceUiData = {
  completeThrough: string;
  signals: TrendSignal[];
  listedSignalIds: string[];
  resolvedSignalIds: string[];
  searchResults: ExploreSearchResult[];
  completedResearch: CompletedResearchItem[];
  dataStatus: "ready" | "disabled" | "building" | "schema_missing";
  usesLegacyFallback: boolean;
};

function uniqueSignals(signals: TrendSignal[]) {
  return [...new Map(signals.map((signal) => [signal.id, signal])).values()];
}

function normalizeV2SearchResults(input: {
  query: string;
  catalog: IntelligenceCatalogMatch[];
  results: IntelligenceSearchResult[];
}): ExploreSearchResult[] {
  const signalRows = input.catalog.map((match) => ({
    id: match.id,
    title: match.label,
    date: "",
    source: match.kind === "buying_opportunity" ? "Buying opportunity" : "Tracked signal",
    sourceType: match.kind.replaceAll("_", " "),
    href: catalogMatchHref(match, input.query),
    passage: match.whyMatched,
    matchReason: "Signal name or alias",
    signalLabel: match.label,
  }));
  const evidenceRows = input.results.map((row) => ({
    id: row.id,
    title: row.title,
    date: row.publishedAt ?? "",
    source: row.publisher ?? row.sourceFamily ?? "Retained source",
    sourceType: row.authority ?? "source",
    href: `/dashboard/intelligence/documents/${row.documentId}`,
    passage: row.passage,
    matchReason: row.whyMatched,
  }));
  return [...signalRows, ...evidenceRows].slice(0, 50);
}

function normalizeLegacySearchResults(rows: Record<string, unknown>[]): ExploreSearchResult[] {
  return rows.map((row) => {
    const documentId = String(row.document_id ?? row.id);
    const matchTypes = Array.isArray(row.match_types) ? row.match_types.map(String) : [];
    const lexical = matchTypes.some((type) => type === "keyword" || type === "full_text");
    return {
      id: documentId,
      title: String(row.title ?? "Untitled source"),
      date: String(row.published_at ?? ""),
      source: String(row.publisher_name ?? "Retained source"),
      sourceType: String(row.source_type ?? "source").replaceAll("_", " "),
      href: `/dashboard/intelligence/documents/${documentId}`,
      passage: typeof row.matching_passage === "string"
        ? row.matching_passage
        : typeof row.summary_short === "string"
          ? row.summary_short
          : null,
      matchReason: lexical ? "Exact terms in this source" : "Relevant passage in this source",
    };
  });
}

/**
 * One UI-facing loader for Overview and Explore. V2 is authoritative as soon as
 * its daily series is ready; legacy analysis is used only while the V2 schema or
 * first backfill is still being built.
 */
export async function getIntelligenceUiData(
  options: GetIntelligenceSignalsOptions = {},
): Promise<IntelligenceUiData> {
  const query = options.q?.trim() ?? "";
  // Search has its own lexical/semantic ranking. Keep the trend collection
  // intact here so a natural-language question cannot erase the chart.
  const response = await getIntelligenceSignals({ ...options, q: undefined });
  if (response.dataStatus === "ready") {
    const ownerId = (await requireDashboardUser()).id;
    const [search, completedResearch] = await Promise.all([
      query
        ? searchIntelligenceV2(query)
        : Promise.resolve({ query: "", catalog: [], results: [] }),
      loadResearchCompletedSinceLastBrief(createAdminClient(), ownerId),
    ]);
    const mapped = v2SignalsToUi([...response.signals, ...response.comparison]);
    return {
      completeThrough: response.completeThrough,
      signals: uniqueSignals(mapped),
      listedSignalIds: response.signals.map((signal) => signal.key || signal.id),
      resolvedSignalIds: response.comparison.map((signal) => signal.key || signal.id),
      searchResults: query ? normalizeV2SearchResults(search) : [],
      completedResearch,
      dataStatus: "ready",
      usesLegacyFallback: false,
    };
  }

  const [legacy, legacySearch] = await Promise.all([
    getTrendingAnalysis(),
    options.q ? searchIntelligenceDocuments(options.q) : Promise.resolve([]),
  ]);
  return {
    completeThrough: legacy.completeThrough,
    signals: toTrendSignals(legacy),
    listedSignalIds: legacy.topics.map((topic) => topic.key),
    resolvedSignalIds: options.compare ?? [],
    searchResults: normalizeLegacySearchResults(legacySearch as Record<string, unknown>[]),
    completedResearch: [],
    dataStatus: response.dataStatus,
    usesLegacyFallback: true,
  };
}
