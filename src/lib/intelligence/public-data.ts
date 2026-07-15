import "server-only";

import type { IntelligenceUiData } from "@/components/dashboard/intelligence/intelligence-ui-data";
import { v2SignalToUi, v2SignalsToUi } from "@/components/dashboard/intelligence/trend-ui-model";
import type { GetIntelligenceSignalsOptions } from "@/lib/intelligence/signals-v2";
import {
  getTursoIntelligenceStore,
  intelligenceUsesTurso,
  type IntelligenceStoredDocument,
} from "@/lib/intelligence/store";
import { canonicalIntelligenceOwnerId } from "@/lib/intelligence/owner";
import {
  publicDocumentHref,
  publicIntelligenceExcerpt,
  publicOriginalUrl,
  publicSignalHref,
  publicSignalSlug,
} from "@/lib/intelligence/public";

const EMPTY_DATA: IntelligenceUiData = {
  completeThrough: "",
  signals: [],
  listedSignalIds: [],
  resolvedSignalIds: [],
  searchResults: [],
  completedResearch: [],
  dataStatus: "disabled",
  usesLegacyFallback: false,
};

function publicEvidenceHref(item: {
  documentId: string;
  title: string;
  url: string | null;
  isResearch: boolean;
}) {
  if (item.isResearch) return publicOriginalUrl(item.url) ?? "/intelligence";
  return publicDocumentHref({ id: item.documentId, title: item.title });
}

export async function getPublicIntelligenceUiData(
  options: GetIntelligenceSignalsOptions = {},
): Promise<IntelligenceUiData> {
  if (!intelligenceUsesTurso()) return EMPTY_DATA;
  const query = options.q?.trim().slice(0, 240) ?? "";
  const store = getTursoIntelligenceStore();
  const [response, search, researchRequests] = await Promise.all([
    store.getSignals({
      range: options.range,
      lens: options.lens,
      kind: options.kind,
      compare: options.compare,
      limit: options.limit,
    }),
    query ? store.searchDocuments(query, 50) : Promise.resolve([]),
    store.listResearchRequests(canonicalIntelligenceOwnerId(), 20),
  ]);
  const mapped = v2SignalsToUi([...response.signals, ...response.comparison], {
    evidenceHref: publicEvidenceHref,
  });
  const uniqueSignals = [...new Map(mapped.map((signal) => [signal.id, signal])).values()];
  return {
    completeThrough: response.completeThrough,
    signals: uniqueSignals,
    listedSignalIds: response.signals.map((signal) => signal.key || signal.id),
    resolvedSignalIds: response.comparison.map((signal) => signal.key || signal.id),
    searchResults: search.map((row) => ({
      id: row.id,
      title: row.title,
      date: row.publishedAt ?? "",
      source: row.publisher ?? row.sourceFamily,
      sourceType: "source",
      href: publicDocumentHref({ id: row.id, title: row.title }),
      passage: publicIntelligenceExcerpt(row.passage, 420),
      matchReason: row.whyMatched,
    })),
    completedResearch: researchRequests
      .filter((request) => request.status === "completed" && request.result && request.completedAt)
      .map((request) => ({
        id: request.id,
        signalLabel: request.signalLabel,
        completedAt: request.completedAt!,
        summary: request.result!.whatChanged,
        assessmentChange: request.result!.assessmentChange,
        href: publicSignalHref({ id: request.signalId, label: request.signalLabel }),
      })),
    dataStatus: response.dataStatus,
    usesLegacyFallback: false,
  };
}

export async function getPublicSignalBySlug(slug: string) {
  if (!intelligenceUsesTurso()) return null;
  const response = await getTursoIntelligenceStore().getSignals({ range: "365d", limit: 250 });
  const signal = response.signals.find((candidate) =>
    publicSignalSlug({ id: candidate.key || candidate.id, label: candidate.label }) === slug
    || publicSignalSlug({ id: candidate.id, label: candidate.label }) === slug
  );
  if (!signal) return null;
  return {
    completeThrough: response.completeThrough,
    generatedAt: response.generatedAt,
    signal: v2SignalToUi(signal, { evidenceHref: publicEvidenceHref }),
  };
}

export async function listPublicSignals() {
  if (!intelligenceUsesTurso()) return [];
  try {
    const response = await getTursoIntelligenceStore().getSignals({ range: "365d", limit: 250 });
    return response.signals.map((signal) => ({
      id: signal.key || signal.id,
      label: signal.label,
      updatedAt: response.generatedAt,
      href: publicSignalHref({ id: signal.key || signal.id, label: signal.label }),
    }));
  } catch {
    // Keep the rest of the sitemap available during a transient Intelligence outage.
    return [];
  }
}

export type PublicIntelligenceDocument = IntelligenceStoredDocument & {
  excerpt: string;
  href: string;
  originalUrl: string | null;
};

function publicDocument(document: IntelligenceStoredDocument): PublicIntelligenceDocument {
  return {
    ...document,
    excerpt: publicIntelligenceExcerpt(document.contentText),
    href: publicDocumentHref(document),
    originalUrl: publicOriginalUrl(document.canonicalUrl),
  };
}

export async function listPublicIntelligenceDocuments(input: { limit?: number; before?: string | null } = {}) {
  if (!intelligenceUsesTurso()) return [];
  return (await getTursoIntelligenceStore().listSignalDocuments(input)).map(publicDocument);
}

export async function getPublicIntelligenceDocument(id: string) {
  if (!intelligenceUsesTurso()) return null;
  const store = getTursoIntelligenceStore();
  const [document, signals] = await Promise.all([
    store.getDocument(id),
    store.getDocumentSignals(id),
  ]);
  if (!document) return null;
  if (!signals.length) return null;
  return {
    document: publicDocument(document),
    signals: signals.map((signal) => ({
      ...signal,
      href: publicSignalHref({ id: signal.key || signal.id, label: signal.label }),
      passage: signal.passage ? publicIntelligenceExcerpt(signal.passage, 520) : null,
    })),
  };
}
