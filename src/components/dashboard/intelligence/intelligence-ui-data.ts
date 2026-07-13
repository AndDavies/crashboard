import "server-only";

import type { ExploreSearchResult } from "./explore-workspace";
import type { CompletedResearchItem } from "./intelligence-overview";
import {
  toTrendSignals,
  v2SignalsToUi,
  type TrendSignal,
} from "./trend-ui-model";
import { searchIntelligenceDocuments } from "@/lib/intelligence/data";
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

export type IntelligenceUiData = {
  completeThrough: string;
  signals: TrendSignal[];
  listedSignalIds: string[];
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
    source: "Tracked signal",
    sourceType: match.kind.replaceAll("_", " "),
    href: `/dashboard/intelligence/explore?q=${encodeURIComponent(input.query)}&signal=${encodeURIComponent(match.id)}`,
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

function recentCompletedResearch(
  response: Awaited<ReturnType<typeof getIntelligenceSignals>>,
): CompletedResearchItem[] {
  const cutoff = Date.now() - 36 * 60 * 60 * 1_000;
  return response.signals
    .filter((signal) => signal.researchStatus === "completed" && signal.researchCompletedAt)
    .filter((signal) => Date.parse(signal.researchCompletedAt!) >= cutoff)
    .sort((a, b) => String(b.researchCompletedAt).localeCompare(String(a.researchCompletedAt)))
    .slice(0, 8)
    .map((signal) => ({
      id: `research:${signal.key}`,
      signalLabel: signal.label,
      completedAt: signal.researchCompletedAt!,
      summary: `${signal.whyNow} ${signal.whyItMatters}`,
      href: `/dashboard/intelligence/explore?signal=${encodeURIComponent(signal.key)}`,
    }));
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
    const search = query
      ? await searchIntelligenceV2(query)
      : { query: "", catalog: [], results: [] };
    const mapped = v2SignalsToUi([...response.signals, ...response.comparison]);
    return {
      completeThrough: response.completeThrough,
      signals: uniqueSignals(mapped),
      listedSignalIds: response.signals.map((signal) => signal.key || signal.id),
      searchResults: query ? normalizeV2SearchResults(search) : [],
      completedResearch: recentCompletedResearch(response),
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
    searchResults: normalizeLegacySearchResults(legacySearch as Record<string, unknown>[]),
    completedResearch: [],
    dataStatus: response.dataStatus,
    usesLegacyFallback: true,
  };
}
