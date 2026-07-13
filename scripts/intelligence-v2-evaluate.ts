import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import {
  INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
  INTELLIGENCE_EVALUATION_TARGETS,
  assertPrivateEvaluationPath,
  buildIntelligenceEvaluationReport,
  isNewsletterEvaluationSource,
  type DuplicatePairReview,
  type EvaluationContentReference,
  type EventTopicLinkReview,
  type IntelligenceEvaluationReport,
  type IntelligenceEvaluationWorkspace,
  type PerformanceSample,
  type SearchReview,
  type SegmentationReview,
  type SurgeReview,
} from "../src/lib/intelligence/evaluation-v2";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "../src/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "../src/lib/intelligence/signal-metrics";

type DbRow = Record<string, unknown>;
type QueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

const DEFAULT_WORKSPACE = ".local/intelligence-evaluation/review.json";
const DEFAULT_REPORT = ".local/intelligence-evaluation/report.json";
const MAX_EXCERPT_CHARS = 800;

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function object(value: unknown): DbRow {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as DbRow : {};
}

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function excerpt(value: unknown) {
  const normalized = compact(value);
  return normalized.length > MAX_EXCERPT_CHARS
    ? `${normalized.slice(0, MAX_EXCERPT_CHARS - 1)}…`
    : normalized;
}

function fingerprint(...values: unknown[]) {
  return createHash("sha256").update(values.map(compact).join("\u001f")).digest("hex");
}

function subtractIsoDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function titleTokens(value: unknown) {
  return new Set(compact(value).toLocaleLowerCase("en-CA").match(/[a-z0-9][a-z0-9-]{1,}/gu) ?? []);
}

function titleSimilarity(left: unknown, right: unknown) {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((value) => b.has(value)).length;
  return intersection / (a.size + b.size - intersection);
}

async function fetchLimited<T>(
  query: (from: number, to: number) => QueryResult<T>,
  limit: number,
) {
  const rows: T[] = [];
  const pageSize = 1_000;
  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(limit - 1, from + pageSize - 1);
    const result = await query(from, to);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < to - from + 1) break;
  }
  return rows;
}

function documentFromSegment(segment: DbRow) {
  return object(segment.documents);
}

function contentReference(segment: DbRow): EvaluationContentReference {
  const document = documentFromSegment(segment);
  return {
    id: String(segment.id),
    documentId: String(segment.document_id),
    title: compact(segment.title ?? document.title ?? "Untitled item"),
    excerpt: excerpt(segment.content_text),
    publishedAt: compact(document.published_at) || null,
    sourceUrl: compact(document.canonical_url ?? document.original_url) || null,
  };
}

function duplicatePair(
  left: DbRow,
  right: DbRow,
  predictedSameStory: boolean,
): DuplicatePairReview {
  const pairIds = [String(left.id), String(right.id)].sort();
  return {
    id: `duplicate-${fingerprint(...pairIds).slice(0, 16)}`,
    predictedSameStory,
    left: contentReference(left),
    right: contentReference(right),
    sameStory: null,
    reviewerNote: "",
  };
}

function sampleDuplicatePairs(input: {
  segments: DbRow[];
  memberships: DbRow[];
  storyClusterIds: Set<string>;
}) {
  const eligible = input.segments.filter(
    (row) => ["editorial", "unknown"].includes(String(row.segment_type)) && !row.exclusion_reason,
  );
  const segmentById = new Map(eligible.map((row) => [String(row.id), row]));
  const clusterBySegment = new Map<string, string>();
  const groups = new Map<string, DbRow[]>();
  for (const membership of input.memberships) {
    const clusterId = String(membership.cluster_id);
    if (!input.storyClusterIds.has(clusterId) || membership.relationship === "review_candidate") continue;
    const segment = segmentById.get(String(membership.segment_id));
    if (!segment) continue;
    clusterBySegment.set(String(segment.id), clusterId);
    const group = groups.get(clusterId) ?? [];
    group.push(segment);
    groups.set(clusterId, group);
  }
  const positives: DuplicatePairReview[] = [];
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const ordered = group.toSorted((a, b) => String(a.id).localeCompare(String(b.id)));
    for (let left = 0; left < ordered.length; left += 1) {
      for (let right = left + 1; right < ordered.length; right += 1) {
        positives.push(duplicatePair(ordered[left], ordered[right], true));
      }
    }
  }
  const negativeCandidates: Array<{ left: DbRow; right: DbRow; similarity: number }> = [];
  const ordered = eligible.toSorted((a, b) => {
    const leftDate = compact(documentFromSegment(a).published_at);
    const rightDate = compact(documentFromSegment(b).published_at);
    return rightDate.localeCompare(leftDate) || String(a.id).localeCompare(String(b.id));
  });
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < Math.min(ordered.length, leftIndex + 31);
      rightIndex += 1
    ) {
      const right = ordered[rightIndex];
      if (left.document_id === right.document_id) continue;
      const leftCluster = clusterBySegment.get(String(left.id));
      const rightCluster = clusterBySegment.get(String(right.id));
      if (leftCluster && leftCluster === rightCluster) continue;
      const sameHash = compact(left.content_hash) === compact(right.content_hash);
      negativeCandidates.push({
        left,
        right,
        similarity: sameHash ? 2 : titleSimilarity(
          left.title ?? documentFromSegment(left).title,
          right.title ?? documentFromSegment(right).title,
        ),
      });
    }
  }
  const negatives = negativeCandidates
    .sort((a, b) => b.similarity - a.similarity)
    .map((candidate) => duplicatePair(candidate.left, candidate.right, false));
  const seen = new Set<string>();
  const selected: DuplicatePairReview[] = [];
  const add = (pair: DuplicatePairReview) => {
    if (seen.has(pair.id) || selected.length >= INTELLIGENCE_EVALUATION_TARGETS.duplicatePairs) return;
    seen.add(pair.id);
    selected.push(pair);
  };
  positives.slice(0, 50).forEach(add);
  negatives.slice(0, 50).forEach(add);
  [...positives.slice(50), ...negatives.slice(50)].forEach(add);
  if (selected.length !== INTELLIGENCE_EVALUATION_TARGETS.duplicatePairs) {
    throw new Error(`Could only create ${selected.length} of 100 duplicate review pairs.`);
  }
  return selected;
}

function sampleSegmentations(segments: DbRow[]) {
  const byDocument = new Map<string, DbRow[]>();
  for (const row of segments.filter((segment) =>
    isNewsletterEvaluationSource(documentFromSegment(segment).source_type)
  )) {
    const group = byDocument.get(String(row.document_id)) ?? [];
    group.push(row);
    byDocument.set(String(row.document_id), group);
  }
  const candidates = [...byDocument.entries()].map(([documentId, rows]) => {
    const document = documentFromSegment(rows[0]);
    const confidence = Math.min(...rows.map((row) => Number(row.confidence ?? 0)));
    return {
      documentId,
      document,
      rows: rows.toSorted((a, b) => Number(a.segment_index) - Number(b.segment_index)),
      confidence,
    };
  }).sort((a, b) => a.confidence - b.confidence || a.documentId.localeCompare(b.documentId));
  const selected = candidates.slice(0, INTELLIGENCE_EVALUATION_TARGETS.segmentationExamples);
  if (selected.length !== INTELLIGENCE_EVALUATION_TARGETS.segmentationExamples) {
    throw new Error(`Could only create ${selected.length} of 50 segmentation examples.`);
  }
  return selected.map(({ documentId, document, rows, confidence }): SegmentationReview => ({
    id: `segmentation-${fingerprint(documentId).slice(0, 16)}`,
    documentId,
    documentTitle: compact(document.title ?? "Untitled newsletter"),
    publishedAt: compact(document.published_at) || null,
    sourceText: compact(document.content_text),
    parserVersion: compact(rows[0].parser_version),
    parserConfidence: confidence,
    segments: rows.map((row) => ({
      id: String(row.id),
      type: String(row.segment_type),
      title: compact(row.title),
      excerpt: excerpt(row.content_text),
      excludedBecause: compact(row.exclusion_reason) || null,
    })),
    acceptable: null,
    correctEditorialItemCount: null,
    containsTrendEligibleBoilerplate: null,
    reviewerNote: "",
  }));
}

function signalMetadata(row: DbRow) {
  return object(row.metadata);
}

function signalSummary(row: DbRow) {
  return object(signalMetadata(row).summary);
}

function evidenceUrlsForSignal(rows: DbRow[], referencesByDocument: Map<string, EvaluationContentReference>) {
  const urls: string[] = [];
  for (const row of rows) {
    const documentIds = Array.isArray(signalMetadata(row).documentIds)
      ? signalMetadata(row).documentIds as unknown[]
      : [];
    for (const documentId of documentIds) {
      const url = referencesByDocument.get(String(documentId))?.sourceUrl;
      if (url) urls.push(url);
    }
  }
  return [...new Set(urls)].slice(0, 10);
}

function distinctSignals(rows: DbRow[]) {
  const groups = new Map<string, DbRow[]>();
  for (const row of rows) {
    const group = groups.get(String(row.signal_key)) ?? [];
    group.push(row);
    groups.set(String(row.signal_key), group);
  }
  return [...groups.entries()].map(([key, signalRows]) => {
    const orderedRows = signalRows.toSorted(
      (a, b) => String(b.signal_date).localeCompare(String(a.signal_date)),
    );
    return { key, rows: orderedRows, latest: orderedRows[0] };
  }).sort((a, b) => Number(b.latest.hidden_rank_score ?? 0) - Number(a.latest.hidden_rank_score ?? 0));
}

function sampleSurges(
  signalGroups: ReturnType<typeof distinctSignals>,
  referencesByDocument: Map<string, EvaluationContentReference>,
) {
  const candidates = signalGroups.flatMap((group) => {
    if (!["topic", "keyword"].includes(String(group.latest.signal_kind))) return [];
    const movement = group.rows.filter((row) =>
      ["new", "rising", "cooling"].includes(String(row.direction))
    ).toSorted((a, b) =>
      Number(b.hidden_rank_score ?? 0) - Number(a.hidden_rank_score ?? 0) ||
      String(b.signal_date).localeCompare(String(a.signal_date))
    )[0];
    return movement ? [{ ...group, evaluation: movement }] : [];
  }).toSorted((a, b) =>
    Number(b.evaluation.hidden_rank_score ?? 0) - Number(a.evaluation.hidden_rank_score ?? 0) ||
    String(b.evaluation.signal_date).localeCompare(String(a.evaluation.signal_date))
  ).slice(0, INTELLIGENCE_EVALUATION_TARGETS.surges);
  if (candidates.length !== INTELLIGENCE_EVALUATION_TARGETS.surges) {
    throw new Error(`Could only create ${candidates.length} of 30 topic or keyword surge examples.`);
  }
  return candidates.map(({ key, latest, evaluation }): SurgeReview => {
    const summary = signalSummary(evaluation);
    const currentReach = Number(summary.current_reach ?? evaluation.raw_reach ?? 0) * 100;
    const previousReach = Number(summary.previous_reach ?? 0) * 100;
    const evidenceUrls = evidenceUrlsForSignal([evaluation], referencesByDocument);
    return {
      id: `surge-${fingerprint(key, evaluation.signal_date).slice(0, 16)}`,
      signalKey: key,
      signalId: String(latest.signal_id),
      signalKind: String(latest.signal_kind),
      signalDate: String(evaluation.signal_date),
      currentLabel: String(latest.signal_label),
      previousLabel: null,
      predictedDirection: String(evaluation.direction),
      whyNow: `${String(evaluation.direction)}: ${currentReach.toFixed(1)}% of coverage versus ${previousReach.toFixed(1)}% in the comparison period ending ${String(evaluation.signal_date)}.`,
      whyNowClaimCount: 1,
      // A URL being present does not prove that it supports the why-now claim.
      // Keep this unverified until a reviewer traces the claim to the retained
      // evidence and explicitly updates the count in the private workspace.
      linkedWhyNowClaimCount: 0,
      evidenceUrls,
      isRealTrend: null,
      labelStable: null,
      reviewerNote: "",
    };
  });
}

function sampleEventTopicLinks(input: {
  links: DbRow[];
  events: DbRow[];
  concepts: DbRow[];
}) {
  const eventById = new Map(input.events.map((row) => [String(row.id), row]));
  const conceptById = new Map(input.concepts.map((row) => [String(row.id), row]));
  const candidates = input.links.flatMap((link) => {
    const event = eventById.get(String(link.event_id));
    const concept = conceptById.get(String(link.concept_id));
    if (!event || !concept || event.review_status === "rejected" || event.event_type === "other") return [];
    return [{ link, event, concept }];
  }).sort((a, b) => Number(b.link.confidence ?? 0) - Number(a.link.confidence ?? 0))
    .slice(0, INTELLIGENCE_EVALUATION_TARGETS.eventTopicLinks);
  if (candidates.length !== INTELLIGENCE_EVALUATION_TARGETS.eventTopicLinks) {
    throw new Error(`Could only create ${candidates.length} of 50 event-to-topic links.`);
  }
  return candidates.map(({ link, event, concept }): EventTopicLinkReview => ({
    id: `event-topic-${fingerprint(link.event_id, link.concept_id).slice(0, 16)}`,
    eventId: String(link.event_id),
    eventTitle: compact(event.title),
    eventSummary: excerpt(event.summary),
    eventType: String(event.event_type),
    topicId: String(link.concept_id),
    topicLabel: compact(concept.canonical_label),
    extractionConfidence: Number(link.confidence ?? 0),
    correctLink: null,
    reviewerNote: "",
  }));
}

function searchCategory(row: DbRow): SearchReview["category"] {
  const label = String(row.signal_label ?? "");
  if (/\b(?:[A-Z][A-Z0-9-]{1,}|[A-Z]-\d[\w-]*)\b/u.test(label)) return "acronym";
  if (["system", "programme"].includes(String(row.signal_kind))) return "system";
  if (row.signal_kind === "organization") return "organization";
  return "topic";
}

function sampleSearches(signalGroups: ReturnType<typeof distinctSignals>) {
  const selected: SearchReview[] = [];
  const used = new Set<string>();
  const add = (
    group: (typeof signalGroups)[number],
    category: SearchReview["category"],
    naturalLanguage = false,
  ) => {
    const latest = group.latest;
    const label = String(latest.signal_label);
    const query = naturalLanguage ? `What is changing around ${label}?` : label;
    const key = `${category}|${query}`;
    if (!label || used.has(key) || selected.length >= INTELLIGENCE_EVALUATION_TARGETS.searches) return;
    used.add(key);
    const documentIds = group.rows.flatMap((row) => {
      const values = signalMetadata(row).documentIds;
      return Array.isArray(values) ? values.map((value) => `document:${value}`) : [];
    });
    selected.push({
      id: `search-${fingerprint(key).slice(0, 16)}`,
      category,
      query,
      expectedResultIds: naturalLanguage
        ? [...new Set(documentIds)].slice(0, 3)
        : [String(latest.signal_key)],
      retrievedResultIds: [],
      durationMs: null,
      relevanceReviewed: false,
      reviewerNote: "",
    });
  };
  for (const category of ["acronym", "system", "organization", "topic"] as const) {
    signalGroups.filter((group) => searchCategory(group.latest) === category).slice(0, 4)
      .forEach((group) => add(group, category));
  }
  signalGroups.slice(0, 4).forEach((group) => add(group, "natural_language", true));
  signalGroups.forEach((group) => add(group, searchCategory(group.latest)));
  if (selected.length !== INTELLIGENCE_EVALUATION_TARGETS.searches) {
    throw new Error(`Could only create ${selected.length} of 20 representative searches.`);
  }
  return selected;
}

async function sourceRows(admin: SupabaseClient, ownerId: string) {
  const completeThrough = latestCompleteDateKey();
  const latestSignal = await admin.from("intelligence_signal_daily")
    .select("signal_date")
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .eq("signal_date", completeThrough)
    .limit(1)
    .maybeSingle();
  if (latestSignal.error) throw new Error(latestSignal.error.message);
  if (!latestSignal.data?.signal_date) {
    throw new Error(`No complete Intelligence v2 signal series is available through ${completeThrough}.`);
  }
  const movementStart = subtractIsoDays(completeThrough, 179);
  const [segments, memberships, clusters, recentSignals, movementSignals, eventLinks, events, concepts] = await Promise.all([
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_document_segments")
      .select("id,document_id,segment_index,segment_type,title,content_text,content_hash,confidence,parser_version,exclusion_reason,documents!inner(title,content_text,published_at,canonical_url,original_url,source_type)")
      .eq("owner_id", ownerId).order("id", { ascending: true }).range(from, to), 50_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_cluster_segments")
      .select("segment_id,cluster_id,relationship").eq("owner_id", ownerId).range(from, to), 50_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_clusters")
      .select("id,cluster_type").eq("owner_id", ownerId)
      .in("cluster_type", ["story", "exact_duplicate", "syndicated"]).range(from, to), 5_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_signal_daily")
      .select("signal_key,signal_id,signal_kind,signal_label,signal_date,direction,raw_reach,hidden_rank_score,metadata")
      .eq("owner_id", ownerId).eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
      .order("signal_date", { ascending: false }).order("hidden_rank_score", { ascending: false })
      .range(from, to), 20_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_signal_daily")
      .select("signal_key,signal_id,signal_kind,signal_label,signal_date,direction,raw_reach,hidden_rank_score,metadata")
      .eq("owner_id", ownerId).eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
      .in("signal_kind", ["topic", "keyword"])
      .in("direction", ["new", "rising", "cooling"])
      .gte("signal_date", movementStart).lte("signal_date", completeThrough)
      .order("hidden_rank_score", { ascending: false }).order("signal_date", { ascending: false })
      .range(from, to), 5_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_event_concepts")
      .select("event_id,concept_id,confidence").eq("owner_id", ownerId)
      .order("confidence", { ascending: false }).range(from, to), 8_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,title,summary,event_type,announced_at,occurred_at,review_status")
      .eq("owner_id", ownerId).range(from, to), 8_000),
    fetchLimited<DbRow>((from, to) => admin.from("intelligence_concepts")
      .select("id,canonical_label,concept_type,status").eq("owner_id", ownerId)
      .in("status", ["active", "candidate"]).range(from, to), 5_000),
  ]);
  const signalsByKeyAndDate = new Map<string, DbRow>();
  for (const row of [...recentSignals, ...movementSignals]) {
    signalsByKeyAndDate.set(`${row.signal_key}|${row.signal_date}`, row);
  }
  return {
    segments,
    memberships,
    clusters,
    signals: [...signalsByKeyAndDate.values()],
    eventLinks,
    events,
    concepts,
    completeThrough,
  };
}

function retainReviews(
  next: IntelligenceEvaluationWorkspace,
  previous: IntelligenceEvaluationWorkspace | null,
) {
  if (!previous || previous.schemaVersion !== INTELLIGENCE_EVALUATION_SCHEMA_VERSION) return next;
  const duplicateById = new Map(previous.duplicatePairs.map((item) => [item.id, item]));
  next.duplicatePairs = next.duplicatePairs.map((item) => {
    const old = duplicateById.get(item.id);
    return old ? { ...item, sameStory: old.sameStory, reviewerNote: old.reviewerNote } : item;
  });
  const segmentationById = new Map(previous.segmentationExamples.map((item) => [item.id, item]));
  next.segmentationExamples = next.segmentationExamples.map((item) => {
    const old = segmentationById.get(item.id);
    return old ? {
      ...item,
      acceptable: old.acceptable,
      correctEditorialItemCount: old.correctEditorialItemCount,
      containsTrendEligibleBoilerplate: old.containsTrendEligibleBoilerplate,
      reviewerNote: old.reviewerNote,
    } : item;
  });
  const surgeById = new Map(previous.surges.map((item) => [item.id, item]));
  const previousSignalByKey = new Map(previous.surges.map((item) => [item.signalKey, item]));
  next.surges = next.surges.map((item) => {
    const oldReview = surgeById.get(item.id);
    const oldSignal = previousSignalByKey.get(item.signalKey);
    return oldSignal ? {
      ...item,
      previousLabel: oldSignal.currentLabel,
      isRealTrend: oldReview?.isRealTrend ?? null,
      labelStable: oldSignal.currentLabel === item.currentLabel,
      reviewerNote: oldReview?.reviewerNote ?? "",
    } : item;
  });
  const linkById = new Map(previous.eventTopicLinks.map((item) => [item.id, item]));
  next.eventTopicLinks = next.eventTopicLinks.map((item) => {
    const old = linkById.get(item.id);
    return old ? { ...item, correctLink: old.correctLink, reviewerNote: old.reviewerNote } : item;
  });
  const searchById = new Map(previous.searches.map((item) => [item.id, item]));
  next.searches = next.searches.map((item) => {
    const old = searchById.get(item.id);
    return old ? {
      ...item,
      expectedResultIds: old.expectedResultIds,
      retrievedResultIds: old.retrievedResultIds,
      durationMs: old.durationMs,
      relevanceReviewed: old.relevanceReviewed,
      reviewerNote: old.reviewerNote,
    } : item;
  });
  next.performance = previous.performance;
  return next;
}

async function readWorkspace(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8")) as IntelligenceEvaluationWorkspace;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function saveJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function initialize() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const output = assertPrivateEvaluationPath(process.cwd(), argument("--out") ?? DEFAULT_WORKSPACE);
  const previous = await readWorkspace(output);
  const data = await sourceRows(createAdminClient(), ownerId);
  const referencesByDocument = new Map<string, EvaluationContentReference>();
  for (const segment of data.segments) {
    if (!referencesByDocument.has(String(segment.document_id))) {
      referencesByDocument.set(String(segment.document_id), contentReference(segment));
    }
  }
  const signalGroups = distinctSignals(data.signals);
  const next: IntelligenceEvaluationWorkspace = {
    schemaVersion: INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    ownerFingerprint: fingerprint(ownerId).slice(0, 16),
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    completeThrough: data.completeThrough,
    instructions: [
      "Set sameStory on all duplicate pairs.",
      "Set acceptable, correctEditorialItemCount, and containsTrendEligibleBoilerplate on every segmentation example.",
      "Set isRealTrend on every surge. Set linkedWhyNowClaimCount only after tracing each why-now claim to the listed evidence URLs.",
      "Run refresh after a later completed signal refresh; labelStable is measured only when previousLabel is populated automatically.",
      "Set correctLink on all event-to-topic links.",
      "Review each search's relevant results, adjust expectedResultIds, and set relevanceReviewed to true before benchmarking.",
      "Never move this file outside .local/intelligence-evaluation because it contains private source excerpts.",
    ],
    duplicatePairs: sampleDuplicatePairs({
      segments: data.segments,
      memberships: data.memberships,
      storyClusterIds: new Set(data.clusters.map((row) => String(row.id))),
    }),
    segmentationExamples: sampleSegmentations(data.segments),
    surges: sampleSurges(signalGroups, referencesByDocument),
    eventTopicLinks: sampleEventTopicLinks({
      links: data.eventLinks,
      events: data.events,
      concepts: data.concepts,
    }),
    searches: sampleSearches(signalGroups),
    performance: { chart: [], search: [] },
  };
  await saveJson(output, retainReviews(next, previous));
  console.log(`Private evaluation workspace created at ${output}.`);
  console.log("Review counts: 100 duplicate pairs, 50 segmentations, 30 surges, 50 event links, and 20 searches.");
}

async function measuredFetch(url: URL, cookie: string) {
  const started = performance.now();
  const response = await fetch(url, { headers: { cookie, accept: "application/json" } });
  const durationMs = Math.round(performance.now() - started);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON from ${url.pathname}; received ${contentType || "unknown content"}.`);
  }
  const body = await response.json() as DbRow;
  if (!response.ok) throw new Error(`${url.pathname} returned ${response.status}: ${compact(body.error)}`);
  return { body, durationMs, status: response.status };
}

async function benchmark() {
  const file = assertPrivateEvaluationPath(process.cwd(), argument("--in") ?? DEFAULT_WORKSPACE);
  const workspace = await readWorkspace(file);
  if (!workspace) throw new Error(`Create ${file} with the init command first.`);
  const cookie = process.env.INTELLIGENCE_EVALUATION_COOKIE?.trim();
  if (!cookie) {
    throw new Error("Set INTELLIGENCE_EVALUATION_COOKIE to an authenticated dashboard Cookie header. It is never stored.");
  }
  const baseUrl = argument("--base-url") ?? "https://crashboard.dev";
  const chartUrl = new URL("/api/intelligence/signals", baseUrl);
  chartUrl.searchParams.set("range", "365d");
  for (const signal of workspace.surges.slice(0, 5)) {
    chartUrl.searchParams.append("compare", signal.signalKey);
  }
  const chart = await measuredFetch(chartUrl, cookie);
  const chartBodySignals = Array.isArray(chart.body.comparison) ? chart.body.comparison : [];
  if (chartBodySignals.length !== 5) {
    throw new Error(
      `The one-year chart benchmark requested five comparison series but received ${chartBodySignals.length}.`,
    );
  }
  workspace.performance.chart.push({
    measuredAt: new Date().toISOString(),
    durationMs: chart.durationMs,
    status: chart.status,
    resultCount: chartBodySignals.length,
  });
  const searchSamples: PerformanceSample[] = [];
  for (const item of workspace.searches) {
    const searchUrl = new URL("/api/intelligence/search", baseUrl);
    searchUrl.searchParams.set("q", item.query);
    searchUrl.searchParams.set("limit", "10");
    const measured = await measuredFetch(searchUrl, cookie);
    const catalog = Array.isArray(measured.body.catalog) ? measured.body.catalog as DbRow[] : [];
    const results = Array.isArray(measured.body.results) ? measured.body.results as DbRow[] : [];
    item.retrievedResultIds = [...new Set([
      ...catalog.map((row) => String(row.id)),
      ...results.map((row) => `document:${String(row.documentId)}`),
    ])].slice(0, 10);
    item.durationMs = measured.durationMs;
    searchSamples.push({
      measuredAt: new Date().toISOString(),
      durationMs: measured.durationMs,
      status: measured.status,
      resultCount: results.length + catalog.length,
    });
  }
  workspace.performance.search.push(...searchSamples);
  await saveJson(file, workspace);
  console.log(`Benchmarked one five-series chart and ${workspace.searches.length} searches against ${baseUrl}.`);
}

function markdownReport(report: IntelligenceEvaluationReport) {
  const display = (value: number | null, percent = true) => value === null
    ? "Not measured"
    : percent ? `${(value * 100).toFixed(1)}%` : `${value.toFixed(0)} ms`;
  return [
    "# Intelligence v2 evaluation report",
    "",
    `Generated: ${report.generatedAt}`,
    `Ready for approval: ${report.readyForApproval ? "Yes" : "No"}`,
    "",
    "| Measure | Result |",
    "|---|---:|",
    `| Duplicate precision | ${display(report.metrics.duplicatePrecision.value)} |`,
    `| Duplicate recall | ${display(report.metrics.duplicateRecall.value)} |`,
    `| False-trend rate | ${display(report.metrics.falseTrendRate.value)} |`,
    `| Search recall@10 | ${display(report.metrics.searchRecallAt10.value)} |`,
    `| Topic-label stability | ${display(report.metrics.topicLabelStability.value)} |`,
    `| Why-now evidence links | ${display(report.metrics.evidenceLinkCompleteness.value)} |`,
    `| Chart maximum response | ${display(report.metrics.chartPerformance.maxMs, false)} |`,
    `| Search maximum response | ${display(report.metrics.searchPerformance.maxMs, false)} |`,
    "",
    "This aggregate report contains no titles, excerpts, queries, URLs, or account identifiers.",
    "",
  ].join("\n");
}

async function report() {
  const input = assertPrivateEvaluationPath(process.cwd(), argument("--in") ?? DEFAULT_WORKSPACE);
  const output = assertPrivateEvaluationPath(process.cwd(), argument("--out") ?? DEFAULT_REPORT);
  const workspace = await readWorkspace(input);
  if (!workspace) throw new Error(`Create ${input} with the init command first.`);
  const result = buildIntelligenceEvaluationReport(workspace);
  await saveJson(output, result);
  const markdownOutput = output.endsWith(".json")
    ? output.replace(/\.json$/u, ".md")
    : `${output}.md`;
  await writeFile(markdownOutput, markdownReport(result), { mode: 0o600 });
  console.log(markdownReport(result));
}

async function main() {
  const command = process.argv[2] ?? "report";
  if (command === "init" || command === "refresh") return initialize();
  if (command === "benchmark") return benchmark();
  if (command === "report") return report();
  throw new Error("Use init, refresh, benchmark, or report.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
