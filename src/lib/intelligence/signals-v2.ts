import "server-only";

import { requireDashboardUser } from "@/lib/blog/data";
import {
  INTELLIGENCE_SIGNAL_METRIC_VERSION,
  type CanonicalSignalDailyRow,
} from "@/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import { recentSignalEvidenceIds } from "@/lib/intelligence/signal-evidence";
import {
  buildSignalQueryPlan,
  chunkSignalKeys,
  parseStoredSignalSummary,
} from "@/lib/intelligence/signals-v2-query";
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
import {
  hasCompletedIntelligenceV2Backfill,
  intelligenceSignalsV2Enabled,
} from "@/lib/intelligence/v2-readiness";

const PAGE_SIZE = 1_000;
const DAY_MS = 86_400_000;
const HISTORY_KEY_CHUNK_SIZE = 20;
const HISTORY_QUERY_CONCURRENCY = 3;
const DAILY_COLUMNS = "signal_key,signal_kind,signal_id,signal_label,lens_keys,signal_date,eligible_items,supporting_items,supporting_documents,unique_stories,mention_count,eligible_tokens,independent_source_count,effective_source_count,primary_source_count,unique_action_count,raw_reach,source_balanced_reach,mentions_per_10k,extraction_confidence,metadata";
const SUMMARY_COLUMNS = "signal_key,signal_kind,signal_id,signal_label,lens_keys,direction,evidence_strength,momentum,acceleration,burst,persistence,novelty,confidence,increase_probability,extraction_confidence,hidden_rank_score,metadata";
const ACTION_LABELS: Record<string, string> = {
  procurement_notice: "Buying opportunity",
  rfi_rfp_challenge: "Information request or challenge",
  award: "Contract awarded",
  funding_investment: "Funding announced",
  partnership: "Partnership announced",
  acquisition: "Acquisition announced",
  development: "In development",
  trial_pilot: "Being tested",
  deployment: "Entering use",
  policy_regulation: "Policy change",
  capacity_expansion: "Capacity expanding",
  cancellation: "Cancelled",
};
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

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    () => worker(),
  ));
  return results;
}

async function fetchSelectedSignalHistory(input: {
  admin: ReturnType<typeof createAdminClient>;
  ownerId: string;
  signalKeys: string[];
  start: string;
  end: string;
}) {
  if (!input.signalKeys.length) return { data: [] as DbRow[], error: null };
  const chunks = chunkSignalKeys(input.signalKeys, HISTORY_KEY_CHUNK_SIZE);
  const results = await mapWithConcurrency(chunks, HISTORY_QUERY_CONCURRENCY, (keys) =>
    fetchPages<DbRow>((from, to) => input.admin
      .from("intelligence_signal_daily")
      .select(DAILY_COLUMNS)
      .eq("owner_id", input.ownerId)
      .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
      .in("signal_key", keys)
      .gte("signal_date", input.start)
      .lte("signal_date", input.end)
      .order("signal_date", { ascending: true })
      .order("signal_key", { ascending: true })
      .range(from, to))
  );
  const error = results.find((result) => result.error)?.error ?? null;
  return { data: results.flatMap((result) => result.data ?? []), error };
}

function totalsFromRows(rows: DbRow[]) {
  const totals = new Map<string, { items: number; tokens: number }>();
  for (const row of rows) {
    const date = String(row.signal_date ?? "");
    if (!date) continue;
    const items = number(row.eligible_items);
    const tokens = number(row.eligible_tokens);
    const current = totals.get(date);
    if (!current || items > current.items) totals.set(date, { items, tokens });
  }
  return totals;
}

function missingTotalsFunction(error: { code?: string; message?: string } | null) {
  return Boolean(error && (
    error.code === "PGRST202" || error.code === "42883" ||
    error.message?.includes("get_intelligence_signal_daily_totals")
  ));
}

async function fetchSignalDailyTotals(input: {
  admin: ReturnType<typeof createAdminClient>;
  ownerId: string;
  start: string;
  end: string;
}) {
  const aggregated = await input.admin.rpc("get_intelligence_signal_daily_totals", {
    query_owner: input.ownerId,
    query_metric_version: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    query_start: input.start,
    query_end: input.end,
  });
  if (!aggregated.error) {
    return totalsFromRows(Array.isArray(aggregated.data) ? aggregated.data as DbRow[] : []);
  }
  if (!missingTotalsFunction(aggregated.error)) throw new Error(aggregated.error.message);

  // Safe rolling-deploy fallback. The RPC removes this duplicate transfer once
  // its ordinary migration is present, but old deployments remain readable.
  const fallback = await fetchPages<DbRow>((from, to) => input.admin
    .from("intelligence_signal_daily")
    .select("signal_date,eligible_items,eligible_tokens")
    .eq("owner_id", input.ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .gte("signal_date", input.start)
    .lte("signal_date", input.end)
    .order("signal_date", { ascending: true })
    .order("signal_key", { ascending: true })
    .range(from, to));
  if (fallback.error) throw new Error(fallback.error.message);
  return totalsFromRows(fallback.data ?? []);
}

async function fetchSignalScopedRows(input: {
  admin: ReturnType<typeof createAdminClient>;
  ownerId: string;
  table: "intelligence_research_leads" | "intelligence_research_results";
  columns: string;
  signalIds: string[];
}) {
  if (!input.signalIds.length) return { data: [] as DbRow[], error: null };
  const chunks = chunkSignalKeys(input.signalIds, 50);
  const results = await mapWithConcurrency(chunks, HISTORY_QUERY_CONCURRENCY, async (ids) => {
    const result = await input.admin.from(input.table)
      .select(input.columns)
      .eq("owner_id", input.ownerId)
      .in("signal_id", ids)
      .order("created_at", { ascending: false })
      .limit(500);
    return { data: (result.data ?? []) as unknown as DbRow[], error: result.error };
  });
  const error = results.find((result) => result.error)?.error ?? null;
  return {
    data: results.flatMap((result) => result.data)
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))),
    error,
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
    .test(value);
}

async function fetchSelectedRelatedRows(input: {
  admin: ReturnType<typeof createAdminClient>;
  ownerId: string;
  signalIds: string[];
}) {
  const uuidIds = [...new Set(input.signalIds.filter(isUuid))];
  if (!uuidIds.length) return { data: [] as DbRow[], error: null };
  const chunks = chunkSignalKeys(uuidIds, 25);
  const results = await mapWithConcurrency(chunks, HISTORY_QUERY_CONCURRENCY, (ids) =>
    fetchPages<DbRow>((from, to) => input.admin.from("intelligence_cooccurrence_snapshots")
      .select("subject_a_id,subject_b_id,support_count,npmi,period_end")
      .eq("owner_id", input.ownerId)
      .eq("qualified", true)
      .or(`subject_a_id.in.(${ids.join(",")}),subject_b_id.in.(${ids.join(",")})`)
      .order("period_end", { ascending: false })
      .order("npmi", { ascending: false })
      .order("subject_a_id", { ascending: true })
      .order("subject_b_id", { ascending: true })
      .range(from, to))
  );
  const error = results.find((result) => result.error)?.error ?? null;
  const deduplicated = new Map<string, DbRow>();
  for (const row of results.flatMap((result) => result.data ?? [])) {
    const key = `${row.subject_a_id}:${row.subject_b_id}:${row.period_end}`;
    if (!deduplicated.has(key)) deduplicated.set(key, row);
  }
  return { data: [...deduplicated.values()], error };
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
  return [...eligibleByBucket.entries()].filter(([, total]) => total.items > 0)
    .map(([date, total]): IntelligenceSignalSeriesPoint => {
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
  const documentIdsByKey = recentSignalEvidenceIds(
    signalRows,
    selectedKeys,
    "documentIds",
  );
  const actionIdsByKey = recentSignalEvidenceIds(signalRows, selectedKeys, "actionIds");
  const documentIds = [...new Set([...documentIdsByKey.values()].flat())];
  const actionIds = [...new Set([...actionIdsByKey.values()].flat())];
  const batches = <T,>(values: T[]) => Array.from(
    { length: Math.ceil(values.length / 100) },
    (_, index) => values.slice(index * 100, index * 100 + 100),
  );
  const [documentResults, actionIdResults, actionClusterResults] = await Promise.all([
    Promise.all(batches(documentIds).map((ids) => admin.from("documents")
      .select("id,title,summary_short,content_text,original_url,canonical_url,publisher_name,published_at,source_identity_id,metadata,intelligence_source_identities(source_family,authority_tier)")
      .eq("owner_id", ownerId).in("id", ids))),
    Promise.all(batches(actionIds).map((ids) => admin.from("intelligence_events")
      .select("id,cluster_id,title,event_type,announced_at,occurred_at")
      .eq("owner_id", ownerId).in("id", ids))),
    Promise.all(batches(actionIds).map((ids) => admin.from("intelligence_events")
      .select("id,cluster_id,title,event_type,announced_at,occurred_at")
      .eq("owner_id", ownerId).in("cluster_id", ids))),
  ]);
  const queryError = [...documentResults, ...actionIdResults, ...actionClusterResults]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(queryError.message);
  const documentById = new Map(documentResults.flatMap((result) => result.data ?? [])
    .map((row) => [String(row.id), row as DbRow]));
  const actionById = new Map<string, DbRow>();
  for (const row of [...actionIdResults, ...actionClusterResults].flatMap((result) => result.data ?? [])) {
    actionById.set(String(row.id), row as DbRow);
    if (row.cluster_id) actionById.set(String(row.cluster_id), row as DbRow);
  }
  const evidenceByKey = new Map<string, IntelligenceSignalEvidence[]>();
  const annotationsByKey = new Map<string, IntelligenceSignalAnnotation[]>();
  for (const key of selectedKeys) {
    const rows = signalRows.get(key) ?? [];
    const documentsForSignal = documentIdsByKey.get(key) ?? [];
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
    const actionsForSignal = actionIdsByKey.get(key) ?? [];
    annotationsByKey.set(key, actionsForSignal.flatMap((id) => {
      const action = actionById.get(id);
      if (!action) return [];
      const eventId = String(action.id ?? id);
      return [{
        id: eventId,
        date: String(action.announced_at ?? action.occurred_at ?? "").slice(0, 10),
        label: ACTION_LABELS[String(action.event_type)] ?? "Important action",
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
  if (!intelligenceSignalsV2Enabled()) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "disabled",
    };
  }
  if (!(await hasCompletedIntelligenceV2Backfill(admin, ownerId))) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "building",
    };
  }
  const chartStart = addDays(completeThrough, -(rangeDays(range) - 1));
  const latestResult = await fetchPages<DbRow>((from, to) => admin
    .from("intelligence_signal_daily")
    .select(SUMMARY_COLUMNS)
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .eq("signal_date", completeThrough)
    .order("hidden_rank_score", { ascending: false })
    .order("signal_key", { ascending: true })
    .range(from, to));
  if (missingSchema(latestResult.error)) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "schema_missing",
    };
  }
  if (latestResult.error) throw new Error(latestResult.error.message);
  if (!(latestResult.data ?? []).length) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "building",
    };
  }
  const summaries = (latestResult.data ?? [])
    .flatMap((row) => parseStoredSignalSummary(row) ?? []);
  if (!summaries.length) {
    return {
      generatedAt: new Date().toISOString(), completeThrough, range, lens, kind,
      total: 0, signals: [], comparison: [], dataStatus: "building",
    };
  }
  const limit = Math.min(250, Math.max(1, options.limit ?? 120));
  const plan = buildSignalQueryPlan({
    summaries,
    lens,
    kind,
    query: options.q,
    compare: options.compare,
    limit,
  });
  const [historyResult, totals] = await Promise.all([
    fetchSelectedSignalHistory({
      admin,
      ownerId,
      signalKeys: plan.historyKeys,
      start: chartStart,
      end: completeThrough,
    }),
    plan.historyKeys.length
      ? fetchSignalDailyTotals({ admin, ownerId, start: chartStart, end: completeThrough })
      : Promise.resolve(new Map<string, { items: number; tokens: number }>()),
  ]);
  if (historyResult.error) throw new Error(historyResult.error.message);
  const groups = new Map<string, CanonicalSignalDailyRow[]>();
  for (const row of historyResult.data.map(parseDailyRow)) {
    const group = groups.get(row.signalKey) ?? [];
    group.push(row);
    groups.set(row.signalKey, group);
  }
  const summaryByKey = new Map(summaries.map((item) => [item.key, item.summary]));
  const selectedSignalIds = [...new Set(plan.historyKeys.flatMap((key) =>
    summaryByKey.get(key)?.signalId ?? []
  ))];
  const [supporting, leadResult, researchResult, relatedResult] = await Promise.all([
    supportingEvidence(ownerId, groups, plan.historyKeys),
    fetchSignalScopedRows({
      admin,
      ownerId,
      table: "intelligence_research_leads",
      columns: "signal_kind,signal_id,status,completed_at,created_at",
      signalIds: selectedSignalIds,
    }),
    fetchSignalScopedRows({
      admin,
      ownerId,
      table: "intelligence_research_results",
      columns: "id,signal_kind,signal_id,what_changed,why_now,why_it_matters,what_to_watch,sources,created_at",
      signalIds: selectedSignalIds,
    }),
    fetchSelectedRelatedRows({ admin, ownerId, signalIds: selectedSignalIds }),
  ]);
  const { evidenceByKey, annotationsByKey } = supporting;
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
    [...plan.selected, ...summaries.filter((item) => plan.compareKeys.includes(item.key))]
      .map((item) => [item.key, item]),
  ).values()];
  const mapped = mappedItems.map(({ key, summary }): IntelligenceSignalSummary => {
    const signalRows = groups.get(key) ?? [];
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
  const selectedKeySet = new Set(plan.selected.map((item) => item.key));
  return {
    generatedAt: new Date().toISOString(),
    completeThrough,
    range,
    lens,
    kind,
    total: plan.filtered.length,
    signals: mapped.filter((signal) => selectedKeySet.has(signal.key)),
    comparison: plan.compareKeys.flatMap((key) => byKey.get(key) ?? []),
    dataStatus: "ready",
  };
}

export async function getIntelligenceSignal(
  id: string,
  options: Pick<GetIntelligenceSignalsOptions, "range"> = {},
) {
  const response = await getIntelligenceSignals({ ...options, compare: [id], limit: 1 });
  return response.comparison[0] ??
    response.signals.find((signal) => signal.key === id || signal.id === id) ??
    null;
}
