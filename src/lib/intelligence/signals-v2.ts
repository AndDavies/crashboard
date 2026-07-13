import "server-only";

import { requireDashboardUser } from "@/lib/blog/data";
import {
  INTELLIGENCE_SIGNAL_METRIC_VERSION,
  summarizeCanonicalSignal,
  type CanonicalSignalDailyRow,
} from "@/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import {
  INTELLIGENCE_SIGNAL_KINDS,
  INTELLIGENCE_SIGNAL_LENSES,
  INTELLIGENCE_SIGNAL_RANGES,
  type IntelligenceSignalAnnotation,
  type IntelligenceSignalEvidence,
  type IntelligenceSignalKind,
  type IntelligenceSignalLens,
  type IntelligenceSignalRange,
  type IntelligenceSignalsResponse,
  type IntelligenceSignalSeriesPoint,
  type IntelligenceSignalSummary,
} from "@/lib/intelligence/signals-v2-types";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 1_000;
const DAY_MS = 86_400_000;
type DbRow = Record<string, unknown>;

export type GetIntelligenceSignalsOptions = {
  range?: IntelligenceSignalRange;
  lens?: IntelligenceSignalLens;
  kind?: IntelligenceSignalKind | "all";
  q?: string;
  compare?: string[];
  limit?: number;
};

function addDays(value: string, days: number) {
  return new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function rangeDays(range: IntelligenceSignalRange) {
  return range === "30d" ? 30 : range === "90d" ? 90 : range === "180d" ? 180 : 365;
}

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function missingSchema(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "42P01" || error.code === "PGRST205" ||
    error.message?.includes("intelligence_signal_daily")
  ));
}

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await query(from, from + PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < PAGE_SIZE) return { data: rows, error: null };
  }
}

function parseDailyRow(row: DbRow): CanonicalSignalDailyRow {
  const metadata = object(row.metadata);
  return {
    signalKey: String(row.signal_key),
    signalId: String(row.signal_id),
    signalKind: row.signal_kind as IntelligenceSignalKind,
    signalLabel: String(row.signal_label),
    signalDate: String(row.signal_date),
    lensKeys: strings(row.lens_keys) as IntelligenceSignalLens[],
    eligibleItems: number(row.eligible_items),
    supportingItems: number(row.supporting_items),
    supportingDocuments: number(row.supporting_documents),
    uniqueStories: number(row.unique_stories),
    mentionCount: number(row.mention_count),
    eligibleTokens: number(row.eligible_tokens),
    independentSourceCount: number(row.independent_source_count),
    effectiveSourceCount: number(row.effective_source_count),
    primarySourceCount: number(row.primary_source_count),
    uniqueActionCount: number(row.unique_action_count),
    rawReach: number(row.raw_reach),
    sourceBalancedReach: number(row.source_balanced_reach),
    mentionsPer10k: number(row.mentions_per_10k),
    extractionConfidence: number(row.extraction_confidence),
    metadata: {
      sourceFamilies: strings(metadata.sourceFamilies ?? metadata.source_families),
      storyIds: strings(metadata.storyIds ?? metadata.story_ids),
      actionIds: strings(metadata.actionIds ?? metadata.action_ids),
      documentIds: strings(metadata.documentIds ?? metadata.document_ids),
      sourceCounts: object(metadata.sourceCounts ?? metadata.source_counts) as Record<string, number>,
    },
  };
}

function percentile75(values: number[]) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.75)] ?? Infinity;
}

function explanation(input: {
  label: string;
  kind: IntelligenceSignalKind;
  direction: "new" | "rising" | "sustained" | "cooling";
  currentReach: number;
  previousReach: number;
  items: number;
  sources: number;
  actions: number;
}) {
  const now = `Now ${input.currentReach.toFixed(1)}% of coverage, previously ${input.previousReach.toFixed(1)}%.`;
  const evidence = `${input.items} supporting items across ${input.sources} independent source ${input.sources === 1 ? "family" : "families"}` +
    (input.actions ? `, with ${input.actions} concrete ${input.actions === 1 ? "action" : "actions"}.` : ".");
  const whyNow = input.direction === "cooling"
    ? `${now} The decline is present after normalizing for total coverage. ${evidence}`
    : `${now} The movement is present after normalizing for total coverage. ${evidence}`;

  let whyItMatters = `Attention to ${input.label} is moving across independent sources, making it worth monitoring for concrete decisions.`;
  if (input.kind === "organization") {
    whyItMatters = `${input.label} is appearing more often in the active evidence base. This can indicate a growing role in funding, buying, delivery, or partnership activity.`;
  } else if (input.kind === "system" || input.kind === "programme") {
    whyItMatters = input.actions
      ? `${input.label} is tied to real-world action, so the signal is moving beyond general discussion toward execution.`
      : `${input.label} is gaining attention, but concrete buying, funding, testing, or deployment evidence is still needed to confirm execution.`;
  } else if (input.kind === "keyword") {
    whyItMatters = `${input.label} is becoming more prominent in the language used across coverage. It can reveal a narrower shift before a broad topic label catches up.`;
  }
  const whatToWatch = input.actions
    ? "Watch the next milestone: named buyers, contract value, delivery timing, test results, or operational use."
    : "Watch for a primary-source announcement, named buyer, funding decision, trial, contract, or deployment.";
  return { whyNow, whyItMatters, whatToWatch };
}

function seriesForRange(input: {
  rows: CanonicalSignalDailyRow[];
  totals: Map<string, { items: number; tokens: number }>;
  start: string;
  end: string;
  daily: boolean;
}) {
  const byDate = new Map(input.rows.map((row) => [row.signalDate, row]));
  const buckets = new Map<string, CanonicalSignalDailyRow[]>();
  const eligibleByBucket = new Map<string, { items: number; tokens: number }>();
  for (let date = input.start, index = 0; date <= input.end; date = addDays(date, 1), index += 1) {
    const bucket = input.daily ? date : addDays(input.start, Math.floor(index / 7) * 7);
    const row = byDate.get(date);
    if (row) {
      const rows = buckets.get(bucket) ?? [];
      rows.push(row);
      buckets.set(bucket, rows);
    }
    const total = eligibleByBucket.get(bucket) ?? { items: 0, tokens: 0 };
    const dayTotal = input.totals.get(date);
    total.items += dayTotal?.items ?? 0;
    total.tokens += dayTotal?.tokens ?? 0;
    eligibleByBucket.set(bucket, total);
  }
  return [...eligibleByBucket.entries()].map(([date, total]): IntelligenceSignalSeriesPoint => {
    const rows = buckets.get(date) ?? [];
    const support = rows.reduce((sum, row) => sum + row.supportingItems, 0);
    const mentions = rows.reduce((sum, row) => sum + row.mentionCount, 0);
    return {
      date,
      shareOfCoverage: 100 * support / Math.max(1, total.items),
      items: support,
      stories: new Set(rows.flatMap((row) => row.metadata.storyIds)).size,
      sources: new Set(rows.flatMap((row) => row.metadata.sourceFamilies)).size,
      actions: new Set(rows.flatMap((row) => row.metadata.actionIds)).size,
      mentionsPer10k: 10_000 * mentions / Math.max(1, total.tokens),
    };
  });
}

async function supportingEvidence(
  ownerId: string,
  signalRows: Map<string, CanonicalSignalDailyRow[]>,
  selectedKeys: string[],
) {
  const admin = createAdminClient();
  const documentIds = [...new Set(selectedKeys.flatMap((key) =>
    (signalRows.get(key) ?? []).slice(-28).flatMap((row) => row.metadata.documentIds)
  ))].slice(0, 400);
  const actionIds = [...new Set(selectedKeys.flatMap((key) =>
    (signalRows.get(key) ?? []).slice(-28).flatMap((row) => row.metadata.actionIds)
  ))].slice(0, 300);
  const [documents, actionsById, actionsByCluster] = await Promise.all([
    documentIds.length ? admin.from("documents")
      .select("id,title,summary_short,content_text,original_url,canonical_url,publisher_name,published_at,source_identity_id,metadata,intelligence_source_identities(source_family,authority_tier)")
      .eq("owner_id", ownerId).in("id", documentIds) : Promise.resolve({ data: [], error: null }),
    actionIds.length ? admin.from("intelligence_events")
      .select("id,cluster_id,title,event_type,announced_at,occurred_at")
      .eq("owner_id", ownerId).in("id", actionIds) : Promise.resolve({ data: [], error: null }),
    actionIds.length ? admin.from("intelligence_events")
      .select("id,cluster_id,title,event_type,announced_at,occurred_at")
      .eq("owner_id", ownerId).in("cluster_id", actionIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (documents.error) throw new Error(documents.error.message);
  if (actionsById.error) throw new Error(actionsById.error.message);
  if (actionsByCluster.error) throw new Error(actionsByCluster.error.message);
  const documentById = new Map((documents.data ?? []).map((row) => [String(row.id), row as DbRow]));
  const actionById = new Map<string, DbRow>();
  for (const row of [...(actionsById.data ?? []), ...(actionsByCluster.data ?? [])]) {
    actionById.set(String(row.id), row as DbRow);
    if (row.cluster_id) actionById.set(String(row.cluster_id), row as DbRow);
  }
  const evidenceByKey = new Map<string, IntelligenceSignalEvidence[]>();
  const annotationsByKey = new Map<string, IntelligenceSignalAnnotation[]>();
  for (const key of selectedKeys) {
    const rows = signalRows.get(key) ?? [];
    const documentsForSignal = [...new Set(rows.slice(-28).flatMap((row) => row.metadata.documentIds))];
    evidenceByKey.set(key, documentsForSignal.flatMap((id) => {
      const document = documentById.get(id);
      if (!document) return [];
      const identity = object(document.intelligence_source_identities);
      const metadata = object(document.metadata);
      return [{
        id,
        documentId: id,
        title: String(document.title ?? "Untitled source"),
        passage: String(document.summary_short ?? document.content_text ?? "").slice(0, 500),
        url: String(document.canonical_url ?? document.original_url ?? "") || null,
        publisher: typeof document.publisher_name === "string" ? document.publisher_name : null,
        publishedAt: typeof document.published_at === "string" ? document.published_at : null,
        sourceFamily: typeof identity.source_family === "string" ? identity.source_family : null,
        authority: typeof identity.authority_tier === "string" ? identity.authority_tier : null,
        storyId: rows.find((row) => row.metadata.documentIds.includes(id))?.metadata.storyIds[0] ?? null,
        whyMatched: "This retained source supports the measured movement in the signal.",
        isResearch: metadata.source_cohort === "research",
      } satisfies IntelligenceSignalEvidence];
    }).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 8));
    const actionsForSignal = [...new Set(rows.flatMap((row) => row.metadata.actionIds))];
    annotationsByKey.set(key, actionsForSignal.flatMap((id) => {
      const action = actionById.get(id);
      if (!action) return [];
      const eventId = String(action.id ?? id);
      return [{
        id: eventId,
        date: String(action.announced_at ?? action.occurred_at ?? "").slice(0, 10),
        label: String(action.event_type ?? "action").replaceAll("_", " "),
        actionType: String(action.event_type ?? "action"),
        title: String(action.title ?? "Announcement"),
        url: `/dashboard/intelligence/events/${eventId}`,
      } satisfies IntelligenceSignalAnnotation];
    }).filter((item) => Boolean(item.date)).sort((a, b) => a.date.localeCompare(b.date)));
  }
  return { evidenceByKey, annotationsByKey };
}

export async function getIntelligenceSignals(
  options: GetIntelligenceSignalsOptions = {},
): Promise<IntelligenceSignalsResponse> {
  const ownerId = (await requireDashboardUser()).id;
  const admin = createAdminClient();
  const range = INTELLIGENCE_SIGNAL_RANGES.includes(options.range as never) ? options.range! : "90d";
  const lens = INTELLIGENCE_SIGNAL_LENSES.includes(options.lens as never) ? options.lens! : "all";
  const kind = options.kind === "all" || INTELLIGENCE_SIGNAL_KINDS.includes(options.kind as never)
    ? options.kind ?? "all"
    : "all";
  const completeThrough = latestCompleteDateKey();
  const chartStart = addDays(completeThrough, -(rangeDays(range) - 1));
  const analysisStart = chartStart < addDays(completeThrough, -111)
    ? chartStart
    : addDays(completeThrough, -111);
  const result = await fetchPages<DbRow>((from, to) => admin
    .from("intelligence_signal_daily")
    .select("signal_key,signal_kind,signal_id,signal_label,lens_keys,signal_date,eligible_items,supporting_items,supporting_documents,unique_stories,mention_count,eligible_tokens,independent_source_count,effective_source_count,primary_source_count,unique_action_count,raw_reach,source_balanced_reach,mentions_per_10k,extraction_confidence,metadata")
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .gte("signal_date", analysisStart)
    .lte("signal_date", completeThrough)
    .order("signal_date", { ascending: true })
    .range(from, to));
  if (missingSchema(result.error)) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "schema_missing",
    };
  }
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []).map(parseDailyRow);
  if (!rows.length) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "building",
    };
  }
  const totals = new Map<string, { items: number; tokens: number }>();
  const groups = new Map<string, CanonicalSignalDailyRow[]>();
  for (const row of rows) {
    const total = totals.get(row.signalDate);
    if (!total || row.eligibleItems > total.items) {
      totals.set(row.signalDate, { items: row.eligibleItems, tokens: row.eligibleTokens });
    }
    const group = groups.get(row.signalKey) ?? [];
    group.push(row);
    groups.set(row.signalKey, group);
  }
  const summaries = [...groups.entries()].flatMap(([key, signalRows]) => {
    const summary = summarizeCanonicalSignal({ rows: signalRows, dailyTotals: totals, completeThrough });
    return summary ? [{ key, signalRows, summary }] : [];
  });
  const quartiles = new Map<IntelligenceSignalKind, number>();
  for (const signalKind of INTELLIGENCE_SIGNAL_KINDS) {
    quartiles.set(signalKind, percentile75(
      summaries.filter((item) => item.summary.signalKind === signalKind && item.summary.hasTwelveCompleteWeeks)
        .map((item) => item.summary.currentReach),
    ));
  }
  const query = options.q?.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-CA") ?? "";
  const filtered = summaries.filter(({ summary }) => {
    if (lens !== "all" && !summary.lensKeys.includes(lens)) return false;
    if (kind !== "all" && summary.signalKind !== kind) return false;
    if (query && !summary.signalLabel.toLocaleLowerCase("en-CA").includes(query)) return false;
    if (summary.direction === "sustained") {
      return summary.hasTwelveCompleteWeeks && summary.activeLastFourWeeks >= 3 &&
        summary.currentReach >= (quartiles.get(summary.signalKind) ?? Infinity) &&
        summary.currentItems >= 3;
    }
    if (summary.direction === "cooling") return summary.previousItems >= 3;
    return summary.currentItems >= 3;
  }).sort((a, b) => b.summary.hiddenRankScore - a.summary.hiddenRankScore);
  const limit = Math.min(250, Math.max(1, options.limit ?? 120));
  const compareKeys = [...new Set(options.compare ?? [])].slice(0, 5);
  const selected = filtered.slice(0, limit);
  const selectedKeys = [...new Set([...selected.slice(0, 30).map((item) => item.key), ...compareKeys])];
  const { evidenceByKey, annotationsByKey } = await supportingEvidence(ownerId, groups, selectedKeys);

  const [leadResult, researchResult, relatedResult] = await Promise.all([
    admin.from("intelligence_research_leads")
      .select("signal_kind,signal_id,status,completed_at")
      .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(500),
    admin.from("intelligence_research_results")
      .select("id,signal_kind,signal_id,what_changed,why_now,why_it_matters,what_to_watch,sources,created_at")
      .eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(500),
    admin.from("intelligence_cooccurrence_snapshots")
      .select("subject_a_id,subject_b_id,support_count,npmi,period_end")
      .eq("owner_id", ownerId).eq("qualified", true)
      .order("period_end", { ascending: false }).order("npmi", { ascending: false }).limit(1_000),
  ]);
  const leadBySignal = new Map<string, DbRow>();
  if (!leadResult.error) {
    for (const row of leadResult.data ?? []) {
      const key = `${row.signal_kind}:${row.signal_id}`;
      if (!leadBySignal.has(key)) leadBySignal.set(key, row as DbRow);
    }
  }

  const researchBySignal = new Map<string, DbRow>();
  if (!researchResult.error) {
    for (const row of researchResult.data ?? []) {
      const key = `${row.signal_kind}:${row.signal_id}`;
      if (!researchBySignal.has(key)) researchBySignal.set(key, row as DbRow);
    }
  }
  const summaryByStableId = new Map(
    summaries.map((item) => [item.summary.signalId, item.summary]),
  );
  const relatedBySignal = new Map<string, Array<{ id: string; kind: IntelligenceSignalKind; label: string }>>();
  if (!relatedResult.error) {
    for (const row of relatedResult.data ?? []) {
      const a = String(row.subject_a_id);
      const b = String(row.subject_b_id);
      const aSummary = summaryByStableId.get(a);
      const bSummary = summaryByStableId.get(b);
      if (!aSummary || !bSummary) continue;
      const aRelated = relatedBySignal.get(a) ?? [];
      if (!aRelated.some((item) => item.id === bSummary.signalKey)) {
        aRelated.push({ id: bSummary.signalKey, kind: bSummary.signalKind, label: bSummary.signalLabel });
      }
      relatedBySignal.set(a, aRelated.slice(0, 8));
      const bRelated = relatedBySignal.get(b) ?? [];
      if (!bRelated.some((item) => item.id === aSummary.signalKey)) {
        bRelated.push({ id: aSummary.signalKey, kind: aSummary.signalKind, label: aSummary.signalLabel });
      }
      relatedBySignal.set(b, bRelated.slice(0, 8));
    }
  }

  const mappedItems = [...new Map(
    [...selected, ...summaries.filter((item) => compareKeys.includes(item.key))]
      .map((item) => [item.key, item]),
  ).values()];
  const mapped = mappedItems.map(({ key, signalRows, summary }): IntelligenceSignalSummary => {
    const currentReach = summary.currentReach * 100;
    const previousReach = summary.previousReach * 100;
    const explanations = explanation({
      label: summary.signalLabel,
      kind: summary.signalKind,
      direction: summary.direction,
      currentReach,
      previousReach,
      items: summary.currentItems,
      sources: summary.currentSources,
      actions: summary.currentActions,
    });
    const lead = leadBySignal.get(`${summary.signalKind}:${summary.signalId}`);
    const research = researchBySignal.get(`${summary.signalKind}:${summary.signalId}`);
    const status = String(lead?.status ?? "not_started") as IntelligenceSignalSummary["researchStatus"];
    const researchSources = Array.isArray(research?.sources) ? research.sources : [];
    const researchEvidence = researchSources.flatMap((source, index) => {
      if (!source || typeof source !== "object") return [];
      const value = source as Record<string, unknown>;
      const url = String(value.url ?? "").trim();
      if (!url) return [];
      return [{
        id: `research:${research?.id}:${index}`,
        documentId: `research:${research?.id}:${index}`,
        title: String(value.title ?? value.domain ?? "Research source"),
        passage: String(value.snippet ?? value.description ?? "Evidence retained by the completed research run."),
        url,
        publisher: typeof value.publisher === "string" ? value.publisher : null,
        publishedAt: typeof value.published_at === "string" ? value.published_at :
          typeof research?.created_at === "string" ? research.created_at : null,
        sourceFamily: typeof value.domain === "string" ? value.domain : null,
        authority: typeof value.authority === "string" ? value.authority : null,
        storyId: `research:${url}`,
        whyMatched: "This source supports the completed deeper research assessment.",
        isResearch: true,
      } satisfies IntelligenceSignalEvidence];
    }).slice(0, 8);
    return {
      id: summary.signalId,
      key,
      kind: summary.signalKind,
      label: summary.signalLabel,
      direction: summary.direction,
      evidenceStrength: summary.evidenceStrength,
      currentReach,
      previousReach,
      changePoints: summary.changePoints,
      currentItems: summary.currentItems,
      previousItems: summary.previousItems,
      stories: summary.currentStories,
      sources: summary.currentSources,
      actions: summary.currentActions,
      momentum: summary.momentum * 100,
      acceleration: summary.acceleration * 100,
      burst: summary.burst,
      persistenceWeeks: summary.persistence,
      novelty: summary.novelty,
      whyNow: typeof research?.why_now === "string" && research.why_now.trim()
        ? research.why_now
        : explanations.whyNow,
      whyItMatters: typeof research?.why_it_matters === "string" && research.why_it_matters.trim()
        ? research.why_it_matters
        : explanations.whyItMatters,
      whatToWatch: typeof research?.what_to_watch === "string" && research.what_to_watch.trim()
        ? research.what_to_watch
        : explanations.whatToWatch,
      lensKeys: summary.lensKeys,
      series: seriesForRange({
        rows: signalRows.filter((row) => row.signalDate >= chartStart),
        totals,
        start: chartStart,
        end: completeThrough,
        daily: range === "30d",
      }),
      related: relatedBySignal.get(summary.signalId) ?? [],
      evidence: [...researchEvidence, ...(evidenceByKey.get(key) ?? [])].slice(0, 10),
      annotations: annotationsByKey.get(key) ?? [],
      researchStatus: ["queued", "running", "completed", "failed"].includes(status)
        ? status
        : "not_started",
      researchCompletedAt: typeof lead?.completed_at === "string" ? lead.completed_at : null,
    };
  });
  const byKey = new Map(mapped.map((signal) => [signal.key, signal]));
  const selectedKeySet = new Set(selected.map((item) => item.key));
  return {
    generatedAt: new Date().toISOString(),
    completeThrough,
    range,
    lens,
    kind,
    total: filtered.length,
    signals: mapped.filter((signal) => selectedKeySet.has(signal.key)),
    comparison: compareKeys.flatMap((key) => byKey.get(key) ?? []),
    dataStatus: "ready",
  };
}

export async function getIntelligenceSignal(
  id: string,
  options: Pick<GetIntelligenceSignalsOptions, "range"> = {},
) {
  const response = await getIntelligenceSignals({ ...options, limit: 250 });
  return response.signals.find((signal) => signal.key === id || signal.id === id) ?? null;
}
