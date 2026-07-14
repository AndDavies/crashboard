import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { disableOpenAiApiForLocalRun } from "../src/lib/intelligence/local-openai-policy";
import {
  INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
  INTELLIGENCE_EVALUATION_TARGETS,
  INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION,
  INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION,
  assertPrivateEvaluationPath,
  buildIntelligenceEvaluationReport,
  intelligenceEvaluationReviewFingerprint,
  isNewsletterEvaluationSource,
  type DuplicatePairReview,
  type EvaluationContentReference,
  type EventTopicLinkReview,
  type EventDuplicatePairReview,
  type EvaluationEventReference,
  type EvaluationRunProvenance,
  type IntelligenceDataQualitySnapshot,
  type IntelligenceEvaluationReport,
  type IntelligenceEvaluationWorkspace,
  type PerformanceSample,
  type SearchReview,
  type SegmentationReview,
  type SurgeReview,
  type VisibleWhyNowReview,
} from "../src/lib/intelligence/evaluation-v2";
import { INTELLIGENCE_EVENT_DEDUP_VERSION } from "../src/lib/intelligence/event-cluster-memberships";
import { INTELLIGENCE_STORY_DEDUP_VERSION } from "../src/lib/intelligence/story-cluster-generations";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "../src/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "../src/lib/intelligence/signal-metrics";

// Evaluation reads stored data or the deployed application. Even benchmark
// requests must use the server's configured embedding key, never a local key.
disableOpenAiApiForLocalRun();

type DbRow = Record<string, unknown>;
type EvaluationRunRow = {
  id: string;
  run_type: "backfill" | "signal_refresh";
  status: string;
  completed_at: string | null;
  checkpoint_after: unknown;
};
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

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function dateKey(value: unknown) {
  const candidate = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(candidate) ? candidate : null;
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

function firstDate(...values: unknown[]) {
  return values.map(dateKey).find(Boolean) ?? null;
}

function firstText(...values: unknown[]) {
  return values.map((value) => compact(value)).find(Boolean) ?? "";
}

function nonnegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function validDatabaseFingerprint(value: unknown) {
  const candidate = compact(value).toLocaleLowerCase("en-CA");
  return /^[a-f0-9]{32,64}$/u.test(candidate) ? candidate : "";
}

function provenanceFromCompletedRun(
  row: EvaluationRunRow,
  requestedCompleteThrough: string,
) {
  const checkpoint = object(row.checkpoint_after);
  const result = object(checkpoint.result);
  const signals = object(checkpoint.signals);
  const resultSignals = object(result.signals);
  const continuation = object(checkpoint.signal_continuation);
  const evaluationSnapshot = object(checkpoint.evaluation_signal_snapshot);
  const completeThrough = firstDate(
    checkpoint.complete_through,
    checkpoint.signal_complete_through,
    checkpoint.completeThrough,
    continuation.completeThrough,
    signals.completeThrough,
    resultSignals.completeThrough,
  );
  const startDate = firstDate(
    continuation.startDate,
    signals.startDate,
    resultSignals.startDate,
  );
  const metricVersion = firstText(
    checkpoint.metric_version,
    checkpoint.metricVersion,
    signals.metricVersion,
    resultSignals.metricVersion,
  );
  const signalRefreshId = firstText(
    checkpoint.refresh_id,
    checkpoint.signal_refresh_id,
    continuation.refreshId,
    signals.refreshId,
    resultSignals.refreshId,
  );
  const storyGenerationId = firstText(
    continuation.storyDedupGenerationId,
    checkpoint.signal_story_dedup_generation_id,
    signals.storyDedupGenerationId,
    resultSignals.storyDedupGenerationId,
  );
  const eventGenerationId = firstText(
    continuation.eventDedupGenerationId,
    checkpoint.signal_event_dedup_generation_id,
    signals.eventDedupGenerationId,
    resultSignals.eventDedupGenerationId,
  );
  if (row.status !== "completed" || !row.completed_at) {
    throw new Error(`Evaluation source run ${row.id} is not completed.`);
  }
  if (completeThrough !== requestedCompleteThrough) {
    throw new Error(
      `Evaluation source run ${row.id} completes through ${completeThrough ?? "an unknown date"}; expected ${requestedCompleteThrough}.`,
    );
  }
  if (!startDate || metricVersion !== INTELLIGENCE_SIGNAL_METRIC_VERSION || !signalRefreshId) {
    throw new Error(
      `Evaluation source run ${row.id} does not contain a complete ${INTELLIGENCE_SIGNAL_METRIC_VERSION} signal checkpoint.`,
    );
  }
  if (!storyGenerationId || !eventGenerationId) {
    throw new Error(`Evaluation source run ${row.id} does not pin both dedup generations.`);
  }
  const snapshotPresent = Object.keys(evaluationSnapshot).length > 0;
  const signalSnapshotFingerprint = validDatabaseFingerprint(
    evaluationSnapshot.signalSnapshotFingerprint,
  );
  const topicLabelFingerprint = validDatabaseFingerprint(
    evaluationSnapshot.topicLabelFingerprint,
  );
  const signalRowCount = nonnegativeInteger(evaluationSnapshot.signalRowCount);
  const completeDaySignalCount = nonnegativeInteger(
    evaluationSnapshot.completeDaySignalCount,
  );
  const topicLabelCount = nonnegativeInteger(evaluationSnapshot.topicLabelCount);
  if (snapshotPresent && (
    compact(evaluationSnapshot.refreshId) !== signalRefreshId ||
    dateKey(evaluationSnapshot.startDate) !== startDate ||
    dateKey(evaluationSnapshot.completeThrough) !== completeThrough ||
    compact(evaluationSnapshot.metricVersion) !== metricVersion ||
    compact(evaluationSnapshot.fingerprintVersion) !==
      INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION ||
    !signalSnapshotFingerprint ||
    !topicLabelFingerprint ||
    signalRowCount <= 0 ||
    completeDaySignalCount <= 0 ||
    topicLabelCount <= 0
  )) {
    throw new Error(`Evaluation source run ${row.id} has an invalid compact signal snapshot.`);
  }
  return {
    sourceRunId: row.id,
    signalRefreshId,
    sourceRunType: row.run_type,
    sourceRunCompletedAt: new Date(row.completed_at).toISOString(),
    startDate,
    completeThrough,
    metricVersion,
    storyGenerationId,
    storyDedupeVersion: INTELLIGENCE_STORY_DEDUP_VERSION,
    eventGenerationId,
    eventDedupeVersion: INTELLIGENCE_EVENT_DEDUP_VERSION,
    validationGenerationPruned: checkpoint.validation_generation_pruned === true,
    signalFingerprintVersion: snapshotPresent
      ? INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION
      : "",
    signalRowCount,
    completeDaySignalCount,
    topicLabelCount,
    signalSnapshotFingerprint,
    topicLabelFingerprint,
  } satisfies EvaluationRunProvenance;
}

async function completedRunProvenance(
  admin: SupabaseClient,
  ownerId: string,
  input: { runId: string; completeThrough: string; requireSignalRefresh?: boolean },
) {
  const result = await admin.from("intelligence_runs")
    .select("id,run_type,status,completed_at,checkpoint_after")
    .eq("owner_id", ownerId)
    .eq("id", input.runId)
    .in("run_type", input.requireSignalRefresh ? ["signal_refresh"] : ["backfill", "signal_refresh"])
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error(`Completed evaluation source run ${input.runId} was not found.`);
  return provenanceFromCompletedRun(
    result.data as EvaluationRunRow,
    input.completeThrough,
  );
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

async function fetchAll<T>(
  query: (from: number, to: number) => QueryResult<T>,
  options: { label?: string; pageSize?: number } = {},
) {
  const rows: T[] = [];
  const pageSize = Math.min(250, Math.max(25, Math.floor(options.pageSize ?? 250)));
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let result: Awaited<QueryResult<T>> | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      result = await query(from, to);
      if (!result.error) break;
      const transient = /(?:statement timeout|canceling statement|timed? out|timeout|fetch failed|network error|socket hang up|connection (?:reset|terminated|closed)|econnreset|etimedout|\b(?:408|425|429|500|502|503|504)\b)/iu
        .test(result.error.message);
      if (!transient || attempt === 3) {
        throw new Error(
          `${options.label ?? "evaluation query"} rows ${from}-${to} failed: ${result.error.message}`,
        );
      }
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250));
    }
    if (!result || result.error) {
      throw new Error(`${options.label ?? "evaluation query"} rows ${from}-${to} failed.`);
    }
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < to - from + 1) break;
  }
  return rows;
}

async function retryEvaluationRead<T>(
  label: string,
  query: () => QueryResult<T>,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await query();
    if (!result.error) return result.data ?? [];
    const transient = /(?:statement timeout|canceling statement|timed? out|timeout|fetch failed|network error|socket hang up|connection (?:reset|terminated|closed)|econnreset|etimedout|\b(?:408|425|429|500|502|503|504)\b)/iu
      .test(result.error.message);
    if (!transient || attempt === 3) {
      throw new Error(`${label} failed: ${result.error.message}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw new Error(`${label} failed.`);
}

const EVALUATION_SIGNAL_SELECT =
  "signal_key,signal_id,signal_kind,signal_label,signal_date,direction,raw_reach,hidden_rank_score,metadata,refresh_id";

async function completeDaySignalRows(
  admin: SupabaseClient,
  ownerId: string,
  provenance: EvaluationRunProvenance,
) {
  const rows: DbRow[] = [];
  let cursor = "";
  const pageSize = 250;
  for (;;) {
    const page = await retryEvaluationRead<DbRow>(
      `complete-day signal page after ${cursor || "start"}`,
      () => {
        let query = admin.from("intelligence_signal_daily")
          .select(EVALUATION_SIGNAL_SELECT)
          .eq("owner_id", ownerId)
          .eq("metric_version", provenance.metricVersion)
          .eq("refresh_id", provenance.signalRefreshId)
          .eq("signal_date", provenance.completeThrough)
          .order("signal_key", { ascending: true })
          .limit(pageSize);
        if (cursor) query = query.gt("signal_key", cursor);
        return query;
      },
    );
    rows.push(...page);
    if (page.length < pageSize) break;
    const nextCursor = compact(page.at(-1)?.signal_key);
    if (!nextCursor || nextCursor <= cursor) {
      throw new Error("Complete-day signal keyset did not advance.");
    }
    cursor = nextCursor;
  }
  return rows;
}

async function movementSignalRows(
  admin: SupabaseClient,
  ownerId: string,
  provenance: EvaluationRunProvenance,
  movementStart: string,
) {
  const kinds = ["topic", "keyword"] as const;
  const directions = ["new", "rising", "cooling"] as const;
  const pages = await Promise.all(kinds.flatMap((kind) => directions.map((direction) =>
    retryEvaluationRead<DbRow>(
      `${kind} ${direction} movement candidates`,
      () => admin.from("intelligence_signal_daily")
        .select(EVALUATION_SIGNAL_SELECT)
        .eq("owner_id", ownerId)
        .eq("metric_version", provenance.metricVersion)
        .eq("refresh_id", provenance.signalRefreshId)
        .eq("signal_kind", kind)
        .eq("direction", direction)
        .gte("signal_date", movementStart)
        .lte("signal_date", provenance.completeThrough)
        .order("hidden_rank_score", { ascending: false })
        .order("signal_date", { ascending: false })
        .order("signal_key", { ascending: true })
        .limit(250),
    )
  )));
  return pages.flat();
}

async function databaseSignalSnapshot(
  admin: SupabaseClient,
  ownerId: string,
  provenance: EvaluationRunProvenance,
) {
  const result = await admin.rpc("intelligence_v2_evaluation_signal_fingerprint", {
    query_owner: ownerId,
    query_start: provenance.startDate,
    query_complete_through: provenance.completeThrough,
    query_metric_version: provenance.metricVersion,
    query_refresh_id: provenance.signalRefreshId,
  });
  if (result.error) {
    throw new Error(`Signal fingerprint snapshot failed: ${result.error.message}`);
  }
  const body = object(result.data);
  const snapshot = {
    signalFingerprintVersion: compact(body.fingerprintVersion),
    signalRowCount: nonnegativeInteger(body.signalRowCount),
    completeDaySignalCount: nonnegativeInteger(body.completeDaySignalCount),
    topicLabelCount: nonnegativeInteger(body.topicLabelCount),
    signalSnapshotFingerprint: validDatabaseFingerprint(body.signalSnapshotFingerprint),
    topicLabelFingerprint: validDatabaseFingerprint(body.topicLabelFingerprint),
  };
  if (
    snapshot.signalRowCount <= 0 ||
    snapshot.signalFingerprintVersion !== INTELLIGENCE_SIGNAL_FINGERPRINT_VERSION ||
    snapshot.completeDaySignalCount <= 0 ||
    snapshot.topicLabelCount <= 0 ||
    !snapshot.signalSnapshotFingerprint ||
    !snapshot.topicLabelFingerprint
  ) {
    throw new Error("Signal fingerprint snapshot is empty or malformed.");
  }
  return snapshot;
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
  candidateReason: DuplicatePairReview["candidateReason"],
): DuplicatePairReview {
  const pairIds = [String(left.id), String(right.id)].sort();
  return {
    id: `duplicate-${fingerprint(...pairIds).slice(0, 16)}`,
    candidateReason,
    predictedSameStory,
    left: contentReference(left),
    right: contentReference(right),
    sameStory: null,
    reviewerNote: "",
  };
}

function eventDate(row: DbRow) {
  return firstDate(row.announced_at, row.occurred_at, row.created_at);
}

function eventReference(row: DbRow): EvaluationEventReference {
  return {
    id: String(row.id),
    title: compact(row.title),
    summary: excerpt(row.summary),
    eventType: String(row.event_type),
    eventDate: eventDate(row),
  };
}

function eventDuplicatePair(
  left: DbRow,
  right: DbRow,
  predictedSameEvent: boolean,
  candidateReason: EventDuplicatePairReview["candidateReason"],
): EventDuplicatePairReview {
  const pairIds = [String(left.id), String(right.id)].sort();
  return {
    id: `event-duplicate-${fingerprint(...pairIds).slice(0, 16)}`,
    candidateReason,
    predictedSameEvent,
    left: eventReference(left),
    right: eventReference(right),
    sameEvent: null,
    reviewerNote: "",
  };
}

function sampleEventDuplicatePairs(input: {
  events: DbRow[];
  memberships: DbRow[];
}) {
  const eligible = input.events.filter((row) =>
    row.review_status !== "rejected" && row.event_type !== "other" && eventDate(row)
  );
  const clusterByEvent = new Map<string, string>();
  for (const membership of input.memberships) {
    const eventId = String(membership.event_id);
    const clusterId = String(membership.cluster_id);
    const existing = clusterByEvent.get(eventId);
    if (existing && existing !== clusterId) {
      throw new Error(`Active event dedup generation assigns ${eventId} to two clusters.`);
    }
    clusterByEvent.set(eventId, clusterId);
  }
  const candidates: Array<{
    left: DbRow;
    right: DbRow;
    score: number;
    reason: EventDuplicatePairReview["candidateReason"];
  }> = [];
  const controls: Array<{ left: DbRow; right: DbRow }> = [];
  const ordered = eligible.toSorted((a, b) =>
    String(eventDate(b)).localeCompare(String(eventDate(a))) ||
    String(a.id).localeCompare(String(b.id))
  );
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < Math.min(ordered.length, leftIndex + 121);
      rightIndex += 1
    ) {
      const right = ordered[rightIndex];
      const leftTime = Date.parse(`${eventDate(left)}T00:00:00.000Z`);
      const rightTime = Date.parse(`${eventDate(right)}T00:00:00.000Z`);
      if (Math.abs(leftTime - rightTime) > 7 * 86_400_000) continue;
      const titleScore = titleSimilarity(left.title, right.title);
      const summaryScore = titleSimilarity(left.summary, right.summary);
      if (titleScore >= 0.25) {
        candidates.push({ left, right, score: 2 + titleScore, reason: "title_similarity" });
      } else if (
        left.event_type === right.event_type &&
        (titleScore >= 0.1 || summaryScore >= 0.12)
      ) {
        candidates.push({
          left,
          right,
          score: titleScore + summaryScore,
          reason: "event_context",
        });
      } else {
        controls.push({ left, right });
      }
    }
  }
  if (candidates.length < 80 || controls.length < 20) {
    throw new Error(
      `The event duplicate contract requires at least 80 evidence candidates and 20 controls; found ${candidates.length} and ${controls.length}.`,
    );
  }
  const selected: EventDuplicatePairReview[] = [];
  const seen = new Set<string>();
  const add = (
    left: DbRow,
    right: DbRow,
    reason: EventDuplicatePairReview["candidateReason"],
  ) => {
    const leftCluster = clusterByEvent.get(String(left.id));
    const rightCluster = clusterByEvent.get(String(right.id));
    const pair = eventDuplicatePair(
      left,
      right,
      Boolean(leftCluster && leftCluster === rightCluster),
      reason,
    );
    if (seen.has(pair.id) || selected.length >= INTELLIGENCE_EVALUATION_TARGETS.eventDuplicatePairs) return;
    seen.add(pair.id);
    selected.push(pair);
  };
  candidates.toSorted((a, b) =>
    b.score - a.score || fingerprint(a.left.id, a.right.id).localeCompare(
      fingerprint(b.left.id, b.right.id),
    )
  ).slice(0, 80).forEach((item) => add(item.left, item.right, item.reason));
  controls.toSorted((a, b) =>
    fingerprint(a.left.id, a.right.id).localeCompare(fingerprint(b.left.id, b.right.id))
  ).forEach((item) => add(item.left, item.right, "deterministic_control"));
  if (selected.length !== INTELLIGENCE_EVALUATION_TARGETS.eventDuplicatePairs) {
    throw new Error(`Could only create ${selected.length} of 100 event duplicate review pairs.`);
  }
  return selected;
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
  for (const membership of input.memberships) {
    const clusterId = String(membership.cluster_id);
    if (!input.storyClusterIds.has(clusterId) || membership.relationship === "review_candidate") continue;
    const segment = segmentById.get(String(membership.segment_id));
    if (!segment) continue;
    const existing = clusterBySegment.get(String(segment.id));
    if (existing && existing !== clusterId) {
      throw new Error(`Active story dedup generation assigns ${segment.id} to two clusters.`);
    }
    clusterBySegment.set(String(segment.id), clusterId);
  }
  const candidates: Array<{
    left: DbRow;
    right: DbRow;
    score: number;
    reason: DuplicatePairReview["candidateReason"];
  }> = [];
  const controls: Array<{ left: DbRow; right: DbRow }> = [];
  const ordered = eligible.toSorted((a, b) => {
    const leftDate = compact(documentFromSegment(a).published_at);
    const rightDate = compact(documentFromSegment(b).published_at);
    return rightDate.localeCompare(leftDate) || String(a.id).localeCompare(String(b.id));
  });
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    const left = ordered[leftIndex];
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < Math.min(ordered.length, leftIndex + 61);
      rightIndex += 1
    ) {
      const right = ordered[rightIndex];
      if (left.document_id === right.document_id) continue;
      const leftPublished = Date.parse(compact(documentFromSegment(left).published_at));
      const rightPublished = Date.parse(compact(documentFromSegment(right).published_at));
      if (
        Number.isFinite(leftPublished) && Number.isFinite(rightPublished) &&
        Math.abs(leftPublished - rightPublished) > 7 * 86_400_000
      ) continue;
      const leftUrl = compact(
        documentFromSegment(left).canonical_url ?? documentFromSegment(left).original_url,
      );
      const rightUrl = compact(
        documentFromSegment(right).canonical_url ?? documentFromSegment(right).original_url,
      );
      const sameHash = compact(left.content_hash) === compact(right.content_hash);
      const similarity = titleSimilarity(
        left.title ?? documentFromSegment(left).title,
        right.title ?? documentFromSegment(right).title,
      );
      if (leftUrl && leftUrl === rightUrl) {
        candidates.push({ left, right, score: 4, reason: "canonical_url" });
      } else if (sameHash) {
        candidates.push({ left, right, score: 3, reason: "content_hash" });
      } else if (similarity >= 0.3) {
        candidates.push({ left, right, score: similarity, reason: "title_similarity" });
      } else {
        controls.push({ left, right });
      }
    }
  }
  const seen = new Set<string>();
  const selected: DuplicatePairReview[] = [];
  const add = (pair: DuplicatePairReview) => {
    if (seen.has(pair.id) || selected.length >= INTELLIGENCE_EVALUATION_TARGETS.duplicatePairs) return;
    seen.add(pair.id);
    selected.push(pair);
  };
  if (candidates.length < 80 || controls.length < 20) {
    throw new Error(
      `The independent duplicate candidate contract requires at least 80 evidence candidates and 20 controls; found ${candidates.length} and ${controls.length}.`,
    );
  }
  candidates.sort((a, b) =>
    b.score - a.score ||
    fingerprint(a.left.id, a.right.id).localeCompare(fingerprint(b.left.id, b.right.id))
  ).slice(0, 80).forEach((candidate) => {
    const leftCluster = clusterBySegment.get(String(candidate.left.id));
    const rightCluster = clusterBySegment.get(String(candidate.right.id));
    add(duplicatePair(
      candidate.left,
      candidate.right,
      Boolean(leftCluster && leftCluster === rightCluster),
      candidate.reason,
    ));
  });
  controls.sort((a, b) =>
    fingerprint(a.left.id, a.right.id).localeCompare(fingerprint(b.left.id, b.right.id))
  ).forEach((candidate) => {
    const leftCluster = clusterBySegment.get(String(candidate.left.id));
    const rightCluster = clusterBySegment.get(String(candidate.right.id));
    add(duplicatePair(
      candidate.left,
      candidate.right,
      Boolean(leftCluster && leftCluster === rightCluster),
      "deterministic_control",
    ));
  });
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
  const selected: typeof candidates = [];
  const used = new Set<string>();
  const add = (candidate: (typeof candidates)[number]) => {
    if (used.has(candidate.documentId) ||
      selected.length >= INTELLIGENCE_EVALUATION_TARGETS.segmentationExamples) return;
    used.add(candidate.documentId);
    selected.push(candidate);
  };
  candidates.slice(0, 25).forEach(add);
  candidates.filter((candidate) => candidate.rows.some((row) =>
    object(row.metadata).coarse_item === true
  )).slice(0, 10).forEach(add);
  candidates.filter((candidate) => candidate.rows.filter((row) =>
    ["editorial", "unknown"].includes(String(row.segment_type)) && !row.exclusion_reason
  ).length > 1).slice(0, 15).forEach(add);
  candidates.toSorted((a, b) =>
    fingerprint(a.documentId).localeCompare(fingerprint(b.documentId))
  ).forEach(add);
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
    const movement = group.rows.filter((row) =>
      ["topic", "keyword"].includes(String(row.signal_kind)) &&
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
  return candidates.map(({ key, evaluation }): SurgeReview => {
    const summary = signalSummary(evaluation);
    const currentReach = Number(summary.current_reach ?? evaluation.raw_reach ?? 0) * 100;
    const previousReach = Number(summary.previous_reach ?? 0) * 100;
    const evidenceUrls = evidenceUrlsForSignal([evaluation], referencesByDocument);
    return {
      id: `surge-${fingerprint(key, evaluation.signal_date).slice(0, 16)}`,
      signalKey: key,
      signalId: String(evaluation.signal_id),
      signalKind: String(evaluation.signal_kind),
      signalDate: String(evaluation.signal_date),
      currentLabel: String(evaluation.signal_label),
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
      directionCorrect: null,
      labelStable: null,
      reviewerNote: "",
    };
  });
}

function topicLabelReviews(
  signalGroups: ReturnType<typeof distinctSignals>,
  completeThrough: string,
) {
  return signalGroups.flatMap((group) => {
    const row = group.rows.find((candidate) =>
      candidate.signal_kind === "topic" &&
      String(candidate.signal_date) === completeThrough
    );
    return row ? [{
      signalKey: group.key,
      currentLabel: String(row.signal_label),
      previousLabel: null,
      labelStable: null,
    }] : [];
  }).toSorted((a, b) => a.signalKey.localeCompare(b.signalKey));
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
  });
  const strata = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const confidence = Number(candidate.link.confidence ?? 0);
    const bucket = confidence >= 0.8 ? "high" : confidence >= 0.65 ? "medium" : "low";
    const key = `${candidate.event.event_type}|${bucket}`;
    const values = strata.get(key) ?? [];
    values.push(candidate);
    strata.set(key, values);
  }
  const orderedStrata = [...strata.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([, values]) => values.toSorted((a, b) =>
      fingerprint(a.link.event_id, a.link.concept_id).localeCompare(
        fingerprint(b.link.event_id, b.link.concept_id),
      )
    ));
  const selected: typeof candidates = [];
  for (let index = 0; selected.length < INTELLIGENCE_EVALUATION_TARGETS.eventTopicLinks; index += 1) {
    let added = false;
    for (const stratum of orderedStrata) {
      const candidate = stratum[index];
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length >= INTELLIGENCE_EVALUATION_TARGETS.eventTopicLinks) break;
    }
    if (!added) break;
  }
  if (selected.length !== INTELLIGENCE_EVALUATION_TARGETS.eventTopicLinks) {
    throw new Error(`Could only create ${selected.length} of 50 event-to-topic links.`);
  }
  return selected.map(({ link, event, concept }): EventTopicLinkReview => ({
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
  const counts = new Map<SearchReview["category"], number>();
  for (const item of selected) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  if (
    selected.length !== INTELLIGENCE_EVALUATION_TARGETS.searches ||
    [...counts.values()].some((count) => count !== 4) || counts.size !== 5
  ) {
    throw new Error(
      `Could not create four independent searches in every required category; generated ${JSON.stringify(Object.fromEntries(counts))}.`,
    );
  }
  return selected;
}

async function sourceRows(
  admin: SupabaseClient,
  ownerId: string,
  provenance: EvaluationRunProvenance,
) {
  const completeThrough = provenance.completeThrough;
  const movementStart = subtractIsoDays(completeThrough, 179);
  if (movementStart < provenance.startDate) {
    throw new Error(
      `Evaluation window ${movementStart} precedes completed run ${provenance.sourceRunId} start ${provenance.startDate}.`,
    );
  }
  const movementStartTimestamp = `${movementStart}T00:00:00.000Z`;
  const completeThroughTimestamp = `${completeThrough}T23:59:59.999Z`;
  const [storyGeneration, eventGeneration] = await Promise.all([
    admin.from("intelligence_story_dedup_generations")
      .select("generation_id,expected_story_cluster_count,expected_segment_membership_count")
      .eq("owner_id", ownerId).eq("dedupe_version", provenance.storyDedupeVersion)
      .eq("status", "active").maybeSingle(),
    admin.from("intelligence_event_dedup_generations")
      .select("generation_id,expected_cluster_count,expected_membership_count,complete_through")
      .eq("owner_id", ownerId).eq("match_version", provenance.eventDedupeVersion)
      .eq("status", "active").maybeSingle(),
  ]);
  const generationError = storyGeneration.error ?? eventGeneration.error;
  if (generationError) throw new Error(generationError.message);
  if (String(storyGeneration.data?.generation_id ?? "") !== provenance.storyGenerationId) {
    throw new Error(`Completed run ${provenance.sourceRunId} does not match the active story generation.`);
  }
  if (String(eventGeneration.data?.generation_id ?? "") !== provenance.eventGenerationId) {
    throw new Error(`Completed run ${provenance.sourceRunId} does not match the active event generation.`);
  }
  const snapshot = await databaseSignalSnapshot(admin, ownerId, provenance);
  const [
    segments,
    allStoryMemberships,
    clusters,
    completeDaySignals,
    movementSignals,
    eventLinks,
    events,
    concepts,
    eventMemberships,
  ] = await Promise.all([
    fetchAll<DbRow>((from, to) => admin.from("intelligence_document_segments")
      .select("id,document_id,segment_index,segment_type,title,content_text,content_hash,confidence,parser_version,metadata,exclusion_reason,documents!inner(title,content_text,published_at,created_at,canonical_url,original_url,source_type)")
      .eq("owner_id", ownerId)
      .or(
        `and(published_at.gte.${movementStartTimestamp},published_at.lte.${completeThroughTimestamp}),and(published_at.is.null,created_at.gte.${movementStartTimestamp},created_at.lte.${completeThroughTimestamp})`,
        { referencedTable: "documents" },
      )
      .order("id", { ascending: true }).range(from, to), { label: "evaluation segments" }),
    fetchAll<DbRow>((from, to) => admin.from("intelligence_cluster_segments")
      .select("segment_id,cluster_id,relationship").eq("owner_id", ownerId)
      .order("cluster_id", { ascending: true }).order("segment_id", { ascending: true })
      .range(from, to), { label: "evaluation story memberships" }),
    fetchAll<DbRow>((from, to) => admin.from("intelligence_clusters")
      .select("id,cluster_type,metadata").eq("owner_id", ownerId)
      .eq("cluster_type", "story")
      .contains("metadata", {
        story_generation_id: provenance.storyGenerationId,
        dedupe_version: provenance.storyDedupeVersion,
      })
      .order("id", { ascending: true }).range(from, to), { label: "evaluation story clusters" }),
    completeDaySignalRows(admin, ownerId, provenance),
    movementSignalRows(admin, ownerId, provenance, movementStart),
    fetchAll<DbRow>((from, to) => admin.from("intelligence_event_concepts")
      .select("event_id,concept_id,confidence").eq("owner_id", ownerId)
      .order("event_id", { ascending: true }).order("concept_id", { ascending: true })
      .range(from, to), { label: "evaluation event-topic links" }),
    fetchAll<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,title,summary,event_type,announced_at,occurred_at,created_at,review_status")
      .eq("owner_id", ownerId).order("id", { ascending: true }).range(from, to),
      { label: "evaluation events" }),
    fetchAll<DbRow>((from, to) => admin.from("intelligence_concepts")
      .select("id,canonical_label,concept_type,status").eq("owner_id", ownerId)
      .in("status", ["active", "candidate"]).order("id", { ascending: true }).range(from, to),
      { label: "evaluation concepts" }),
    fetchAll<DbRow>((from, to) => admin.from("intelligence_event_cluster_memberships")
      .select("generation_id,cluster_id,event_id,relationship,match_version")
      .eq("owner_id", ownerId).eq("generation_id", provenance.eventGenerationId)
      .eq("match_version", provenance.eventDedupeVersion)
      .order("event_id", { ascending: true }).range(from, to),
      { label: "evaluation event memberships" }),
  ]);
  if (completeDaySignals.length !== snapshot.completeDaySignalCount) {
    throw new Error(
      `Complete-day signal keyset returned ${completeDaySignals.length} rows; expected ${snapshot.completeDaySignalCount}.`,
    );
  }
  const signalByKeyAndDate = new Map<string, DbRow>();
  for (const row of [...movementSignals, ...completeDaySignals]) {
    signalByKeyAndDate.set(`${row.signal_key}|${row.signal_date}`, row);
  }
  const signals = [...signalByKeyAndDate.values()];
  const storyClusterIds = new Set(clusters.map((row) => String(row.id)));
  const memberships = allStoryMemberships.filter((row) =>
    storyClusterIds.has(String(row.cluster_id))
  );
  if (clusters.length !== Number(storyGeneration.data?.expected_story_cluster_count ?? -1) ||
    memberships.length !== Number(storyGeneration.data?.expected_segment_membership_count ?? -1)) {
    throw new Error("The active story generation is incomplete or ambiguously loaded.");
  }
  if (eventMemberships.length !== Number(eventGeneration.data?.expected_membership_count ?? -1)) {
    throw new Error("The active event generation is incomplete or ambiguously loaded.");
  }
  if (!signals.some((row) => String(row.signal_date) === completeThrough)) {
    throw new Error(
      `Completed run ${provenance.sourceRunId} has no pinned signal rows through ${completeThrough}.`,
    );
  }
  const windowEvents = events.filter((row) => {
    const date = eventDate(row);
    return Boolean(date && date >= movementStart && date <= completeThrough);
  });
  const windowEventIds = new Set(windowEvents.map((row) => String(row.id)));
  return {
    segments,
    memberships,
    clusters,
    signals,
    eventLinks: eventLinks.filter((row) => windowEventIds.has(String(row.event_id))),
    eventMemberships: eventMemberships.filter((row) => windowEventIds.has(String(row.event_id))),
    events: windowEvents,
    concepts,
    snapshot,
    completeThrough,
    movementStart,
  };
}

async function hydrateSignalFingerprints(
  admin: SupabaseClient,
  ownerId: string,
  provenance: EvaluationRunProvenance,
) {
  const snapshot = await databaseSignalSnapshot(admin, ownerId, provenance);
  return {
    ...provenance,
    ...snapshot,
  } satisfies EvaluationRunProvenance;
}

function hasCompactSignalSnapshot(provenance: EvaluationRunProvenance) {
  return provenance.sourceRunType === "signal_refresh" &&
    provenance.validationGenerationPruned &&
    provenance.signalRowCount > 0 &&
    provenance.completeDaySignalCount > 0 &&
    provenance.topicLabelCount > 0 &&
    Boolean(provenance.signalSnapshotFingerprint) &&
    Boolean(provenance.topicLabelFingerprint);
}

function validationSnapshot(provenance: EvaluationRunProvenance) {
  return {
    sourceRunId: provenance.sourceRunId,
    signalRefreshId: provenance.signalRefreshId,
    sourceRunCompletedAt: provenance.sourceRunCompletedAt,
    startDate: provenance.startDate,
    completeThrough: provenance.completeThrough,
    metricVersion: provenance.metricVersion,
    signalFingerprintVersion: provenance.signalFingerprintVersion,
    signalRowCount: provenance.signalRowCount,
    completeDaySignalCount: provenance.completeDaySignalCount,
    topicLabelCount: provenance.topicLabelCount,
    signalSnapshotFingerprint: provenance.signalSnapshotFingerprint,
    topicLabelFingerprint: provenance.topicLabelFingerprint,
  };
}

function retainCompactValidationSnapshot(
  previous: IntelligenceEvaluationWorkspace,
  provenance: EvaluationRunProvenance,
) {
  if (previous.schemaVersion !== INTELLIGENCE_EVALUATION_SCHEMA_VERSION) {
    throw new Error(`Evaluation workspace must use ${INTELLIGENCE_EVALUATION_SCHEMA_VERSION}.`);
  }
  if (
    previous.metricVersion !== provenance.metricVersion ||
    previous.provenance.startDate !== provenance.startDate ||
    previous.provenance.completeThrough !== provenance.completeThrough ||
    previous.provenance.storyGenerationId !== provenance.storyGenerationId ||
    previous.provenance.eventGenerationId !== provenance.eventGenerationId
  ) {
    throw new Error(
      "Compact validation snapshot does not match the retained fixed window and dedup generations.",
    );
  }
  const labelStable = previous.provenance.topicLabelFingerprint ===
    provenance.topicLabelFingerprint;
  previous.provenance = provenance;
  previous.generatedAt = new Date().toISOString();
  previous.completeThrough = provenance.completeThrough;
  previous.validationSnapshots = [
    ...previous.validationSnapshots.filter((item) =>
      item.sourceRunId !== provenance.sourceRunId
    ),
    validationSnapshot(provenance),
  ].sort((a, b) => a.sourceRunCompletedAt.localeCompare(b.sourceRunCompletedAt));
  previous.topicLabels = previous.topicLabels.map((item) => ({
    ...item,
    previousLabel: item.currentLabel,
    labelStable,
  }));
  previous.surges = previous.surges.map((item) => ({
    ...item,
    previousLabel: item.currentLabel,
    labelStable,
  }));
  previous.visibleWhyNowClaims = [];
  previous.performance = { chart: [], search: [] };
  previous.dataQuality = null;
  previous.benchmark = null;
  previous.searches = previous.searches.map((item) => ({
    ...item,
    retrievedResultIds: [],
    durationMs: null,
  }));
  previous.reviewFingerprint = intelligenceEvaluationReviewFingerprint(previous);
  return previous;
}

function retainReviews(
  next: IntelligenceEvaluationWorkspace,
  previous: IntelligenceEvaluationWorkspace | null,
) {
  if (!previous) return next;
  if (previous.schemaVersion !== INTELLIGENCE_EVALUATION_SCHEMA_VERSION) {
    throw new Error(
      `Existing evaluation workspace uses ${previous.schemaVersion}; move it aside and create a fresh ${INTELLIGENCE_EVALUATION_SCHEMA_VERSION} workspace.`,
    );
  }
  if (previous.ownerFingerprint !== next.ownerFingerprint ||
    previous.metricVersion !== next.metricVersion) {
    throw new Error("Existing evaluation workspace belongs to another owner or metric version.");
  }
  if (previous.provenance.startDate !== next.provenance.startDate ||
    previous.provenance.completeThrough !== next.provenance.completeThrough) {
    throw new Error(
      "Validation refreshes must use the exact same fixed window. Create a separate workspace for current-window acceptance.",
    );
  }
  const duplicateById = new Map(previous.duplicatePairs.map((item) => [item.id, item]));
  next.duplicatePairs = next.duplicatePairs.map((item) => {
    const old = duplicateById.get(item.id);
    return old ? { ...item, sameStory: old.sameStory, reviewerNote: old.reviewerNote } : item;
  });
  const eventDuplicateById = new Map(
    previous.eventDuplicatePairs.map((item) => [item.id, item]),
  );
  next.eventDuplicatePairs = next.eventDuplicatePairs.map((item) => {
    const old = eventDuplicateById.get(item.id);
    return old ? { ...item, sameEvent: old.sameEvent, reviewerNote: old.reviewerNote } : item;
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
      directionCorrect: oldReview?.directionCorrect ?? null,
      labelStable: oldSignal.currentLabel === item.currentLabel,
      linkedWhyNowClaimCount: oldReview?.linkedWhyNowClaimCount ?? 0,
      reviewerNote: oldReview?.reviewerNote ?? "",
    } : item;
  });
  const previousTopicByKey = new Map(
    previous.topicLabels.map((item) => [item.signalKey, item]),
  );
  const nextTopicByKey = new Map(next.topicLabels.map((item) => [item.signalKey, item]));
  next.topicLabels = [...new Set([
    ...previousTopicByKey.keys(),
    ...nextTopicByKey.keys(),
  ])].map((signalKey) => {
    const old = previousTopicByKey.get(signalKey);
    const current = nextTopicByKey.get(signalKey);
    return {
      signalKey,
      currentLabel: current?.currentLabel ?? "",
      previousLabel: old?.currentLabel ?? null,
      labelStable: Boolean(old && current && old.currentLabel === current.currentLabel),
    };
  }).sort((a, b) => a.signalKey.localeCompare(b.signalKey));
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
      retrievedResultIds: [],
      durationMs: null,
      relevanceReviewed: old.relevanceReviewed,
      reviewerNote: old.reviewerNote,
    } : item;
  });
  next.validationSnapshots = [...previous.validationSnapshots.filter((item) =>
    item.sourceRunId !== next.provenance.sourceRunId
  ), validationSnapshot(next.provenance)]
    .sort((a, b) => a.sourceRunCompletedAt.localeCompare(b.sourceRunCompletedAt));
  next.visibleWhyNowClaims = [];
  next.performance = { chart: [], search: [] };
  next.dataQuality = null;
  next.benchmark = null;
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

const REQUIRED_DATA_QUALITY_GATES = [
  "measurementCoverageAtLeast95Percent",
  "sourceFamiliesComplete",
  "newsletterParserRebuildComplete",
  "excludedSegmentsIsolated",
  "eventLinkCoverageAtLeast90Percent",
  "noFutureVisibleEvents",
  "canonicalSeriesValid",
  "dailyDenominatorsConsistent",
  "researchCohortIsolated",
] as const;

async function qualitySnapshot() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const runId = argument("--run-id")?.trim();
  if (!runId) throw new Error("Pass the exact completed current-window --run-id.");
  const completeThrough = dateKey(argument("--complete-through"));
  if (!completeThrough) throw new Error("Pass the current completed --complete-through date.");
  if (completeThrough !== latestCompleteDateKey()) {
    throw new Error(
      `Current acceptance must complete through ${latestCompleteDateKey()}; received ${completeThrough}.`,
    );
  }
  const file = assertPrivateEvaluationPath(process.cwd(), argument("--in") ?? DEFAULT_WORKSPACE);
  const workspace = await readWorkspace(file);
  if (!workspace) throw new Error(`Create ${file} with the init command first.`);
  if (workspace.schemaVersion !== INTELLIGENCE_EVALUATION_SCHEMA_VERSION) {
    throw new Error(`Evaluation workspace must use ${INTELLIGENCE_EVALUATION_SCHEMA_VERSION}.`);
  }
  if (workspace.ownerFingerprint !== fingerprint(ownerId).slice(0, 16)) {
    throw new Error("The evaluation workspace belongs to another owner.");
  }
  const admin = createAdminClient();
  const baseProvenance = await completedRunProvenance(admin, ownerId, {
    runId,
    completeThrough,
    requireSignalRefresh: true,
  });
  if (baseProvenance.signalRefreshId !== baseProvenance.sourceRunId) {
    throw new Error("Current acceptance requires a signal-refresh run with an exact run-bound snapshot.");
  }
  const provenance = await hydrateSignalFingerprints(admin, ownerId, baseProvenance);
  const result = await admin.rpc("intelligence_v2_acceptance_snapshot", {
    query_owner: ownerId,
    query_start: provenance.startDate,
    query_complete_through: provenance.completeThrough,
    query_metric_version: provenance.metricVersion,
    query_refresh_id: provenance.signalRefreshId,
    query_story_generation_id: provenance.storyGenerationId,
    query_event_generation_id: provenance.eventGenerationId,
  });
  if (result.error) throw new Error(`Acceptance snapshot failed: ${result.error.message}`);
  const body = object(result.data);
  const measurements = object(body.measurements);
  const rawGates = object(body.gates);
  const gates = Object.fromEntries(REQUIRED_DATA_QUALITY_GATES.map((name) => {
    if (typeof rawGates[name] !== "boolean") {
      throw new Error(`Acceptance snapshot omitted boolean gate ${name}.`);
    }
    return [name, rawGates[name]];
  })) as IntelligenceDataQualitySnapshot["gates"];
  const snapshot: IntelligenceDataQualitySnapshot = {
    schemaVersion: INTELLIGENCE_DATA_QUALITY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    provenance,
    measurements: Object.fromEntries(Object.entries(measurements).map(([key, value]) => [
      key,
      value === null ? null : Number(value),
    ])),
    gates,
  };
  workspace.dataQuality = snapshot;
  workspace.benchmark = null;
  workspace.performance = { chart: [], search: [] };
  workspace.visibleWhyNowClaims = [];
  workspace.searches = workspace.searches.map((item) => ({
    ...item,
    retrievedResultIds: [],
    durationMs: null,
  }));
  workspace.generatedAt = new Date().toISOString();
  workspace.reviewFingerprint = intelligenceEvaluationReviewFingerprint(workspace);
  await saveJson(file, workspace);
  console.log(`Current-window data-quality snapshot recorded for run ${runId}.`);
}

async function initialize(command: "init" | "refresh") {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const runId = argument("--run-id")?.trim();
  if (!runId) throw new Error("Pass the exact completed --run-id used for this evaluation snapshot.");
  const completeThrough = dateKey(argument("--complete-through"));
  if (!completeThrough) throw new Error("Pass the completed run's exact --complete-through date.");
  const output = assertPrivateEvaluationPath(process.cwd(), argument("--out") ?? DEFAULT_WORKSPACE);
  const previous = await readWorkspace(output);
  if (command === "init" && previous && !hasFlag("--replace")) {
    throw new Error(`Evaluation workspace ${output} already exists; use refresh or pass --replace.`);
  }
  if (command === "refresh" && !previous) {
    throw new Error(`Create ${output} with init before recording validation refreshes.`);
  }
  const admin = createAdminClient();
  const baseProvenance = await completedRunProvenance(admin, ownerId, {
    runId,
    completeThrough,
  });
  if (
    command === "refresh" &&
    previous &&
    baseProvenance.sourceRunId === previous.provenance.sourceRunId
  ) {
    if (previous.ownerFingerprint !== fingerprint(ownerId).slice(0, 16)) {
      throw new Error("The evaluation workspace belongs to another owner.");
    }
    const provenance = await hydrateSignalFingerprints(admin, ownerId, baseProvenance);
    if (
      provenance.startDate !== previous.provenance.startDate ||
      provenance.completeThrough !== previous.provenance.completeThrough ||
      provenance.storyGenerationId !== previous.provenance.storyGenerationId ||
      provenance.eventGenerationId !== previous.provenance.eventGenerationId ||
      provenance.topicLabelCount !== previous.topicLabels.length
    ) {
      throw new Error("Rehydrated baseline provenance does not match the retained review set.");
    }
    previous.provenance = provenance;
    previous.generatedAt = new Date().toISOString();
    previous.validationSnapshots = [
      ...previous.validationSnapshots.filter((item) =>
        item.sourceRunId !== provenance.sourceRunId
      ),
      validationSnapshot(provenance),
    ].sort((a, b) => a.sourceRunCompletedAt.localeCompare(b.sourceRunCompletedAt));
    previous.dataQuality = null;
    previous.benchmark = null;
    previous.performance = { chart: [], search: [] };
    previous.visibleWhyNowClaims = [];
    previous.searches = previous.searches.map((item) => ({
      ...item,
      retrievedResultIds: [],
      durationMs: null,
    }));
    previous.reviewFingerprint = intelligenceEvaluationReviewFingerprint(previous);
    await saveJson(output, previous);
    console.log(`Rehydrated retained baseline provenance from completed run ${runId}.`);
    return;
  }
  if (command === "refresh" && previous && hasCompactSignalSnapshot(baseProvenance)) {
    if (previous.ownerFingerprint !== fingerprint(ownerId).slice(0, 16)) {
      throw new Error("The evaluation workspace belongs to another owner.");
    }
    const retained = retainCompactValidationSnapshot(previous, baseProvenance);
    await saveJson(output, retained);
    console.log(
      `Recorded compact fixed-window validation snapshot from completed run ${runId}.`,
    );
    return;
  }
  const data = await sourceRows(admin, ownerId, baseProvenance);
  const referencesByDocument = new Map<string, EvaluationContentReference>();
  for (const segment of data.segments) {
    if (!referencesByDocument.has(String(segment.document_id))) {
      referencesByDocument.set(String(segment.document_id), contentReference(segment));
    }
  }
  const signalGroups = distinctSignals(data.signals);
  const topicLabels = topicLabelReviews(signalGroups, data.completeThrough);
  if (topicLabels.length !== data.snapshot.topicLabelCount) {
    throw new Error(
      `Complete-day topic catalogue returned ${topicLabels.length} labels; expected ${data.snapshot.topicLabelCount}.`,
    );
  }
  const provenance: EvaluationRunProvenance = {
    ...baseProvenance,
    ...data.snapshot,
  };
  let next: IntelligenceEvaluationWorkspace = {
    schemaVersion: INTELLIGENCE_EVALUATION_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    ownerFingerprint: fingerprint(ownerId).slice(0, 16),
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    completeThrough: data.completeThrough,
    reviewFingerprint: "",
    provenance,
    validationSnapshots: [validationSnapshot(provenance)],
    instructions: [
      "Set sameStory on all story duplicate pairs and sameEvent on all event duplicate pairs. Both fixed candidate sets are selected without using their predicted active-generation cluster label.",
      "Set acceptable, correctEditorialItemCount, and containsTrendEligibleBoilerplate on every segmentation example.",
      "Set isRealTrend and directionCorrect on every surge. Set linkedWhyNowClaimCount only after tracing every why-now claim to the listed evidence URLs; approval requires every sampled claim to be linked.",
      "Run refresh after each fixed-window validation run. Topic labels and snapshot fingerprints are compared automatically across all seven retained snapshots.",
      "Set correctLink on all event-to-topic links.",
      "Review each search's relevant results, adjust expectedResultIds, and set relevanceReviewed to true before benchmarking.",
      "After benchmarking, trace every visible Why now statement to its listed URLs and set supportedByLinkedEvidence on every visibleWhyNowClaims item.",
      "Never move this file outside .local/intelligence-evaluation because it contains private source excerpts.",
    ],
    duplicatePairs: sampleDuplicatePairs({
      segments: data.segments,
      memberships: data.memberships,
      storyClusterIds: new Set(data.clusters.map((row) => String(row.id))),
    }),
    eventDuplicatePairs: sampleEventDuplicatePairs({
      events: data.events,
      memberships: data.eventMemberships,
    }),
    segmentationExamples: sampleSegmentations(data.segments),
    surges: sampleSurges(signalGroups, referencesByDocument),
    topicLabels,
    eventTopicLinks: sampleEventTopicLinks({
      links: data.eventLinks,
      events: data.events,
      concepts: data.concepts,
    }),
    searches: sampleSearches(signalGroups),
    visibleWhyNowClaims: [],
    performance: { chart: [], search: [] },
    dataQuality: null,
    benchmark: null,
  };
  next = retainReviews(next, command === "refresh" ? previous : null);
  next.reviewFingerprint = intelligenceEvaluationReviewFingerprint(next);
  await saveJson(output, next);
  console.log(`Private evaluation workspace created at ${output}.`);
  console.log("Review counts: 100 story duplicate pairs, 100 event duplicate pairs, 50 segmentations, 30 surges, 50 event links, and 20 searches.");
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

function visibleWhyNowReviews(
  signals: DbRow[],
  completeThrough: string,
  previous: VisibleWhyNowReview[],
) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return signals.map((signal): VisibleWhyNowReview => {
    const evidence = Array.isArray(signal.evidence) ? signal.evidence as DbRow[] : [];
    const evidenceUrls = [...new Set(evidence.map((item) => compact(item.url)).filter(Boolean))];
    const signalKey = compact(signal.key);
    const whyNow = compact(signal.whyNow);
    const id = `visible-why-now-${fingerprint(
      signalKey,
      completeThrough,
      whyNow,
      ...evidenceUrls.toSorted(),
    ).slice(0, 16)}`;
    const old = previousById.get(id);
    return {
      id,
      signalKey,
      signalDate: completeThrough,
      whyNow,
      evidenceUrls,
      supportedByLinkedEvidence: old?.supportedByLinkedEvidence ?? null,
      reviewerNote: old?.reviewerNote ?? "",
    };
  });
}

async function benchmark() {
  const file = assertPrivateEvaluationPath(process.cwd(), argument("--in") ?? DEFAULT_WORKSPACE);
  const workspace = await readWorkspace(file);
  if (!workspace) throw new Error(`Create ${file} with the init command first.`);
  if (workspace.schemaVersion !== INTELLIGENCE_EVALUATION_SCHEMA_VERSION) {
    throw new Error(`Evaluation workspace must use ${INTELLIGENCE_EVALUATION_SCHEMA_VERSION}.`);
  }
  if (!workspace.dataQuality) {
    throw new Error("Record the current-window data-quality snapshot before benchmarking production.");
  }
  const currentReviewFingerprint = intelligenceEvaluationReviewFingerprint(workspace);
  if (workspace.reviewFingerprint !== currentReviewFingerprint) {
    throw new Error(
      "The reviewed search expectations or fixed evaluation set changed. Refresh the review fingerprint through the quality command before benchmarking.",
    );
  }
  if (workspace.searches.some((item) =>
    !item.relevanceReviewed || item.expectedResultIds.length === 0
  )) {
    throw new Error("Freeze independently reviewed expected IDs for all 20 searches before benchmarking.");
  }
  const cookie = process.env.INTELLIGENCE_EVALUATION_COOKIE?.trim();
  if (!cookie) {
    throw new Error("Set INTELLIGENCE_EVALUATION_COOKIE to an authenticated dashboard Cookie header. It is never stored.");
  }
  const baseUrl = argument("--base-url") ?? "https://crashboard.dev";
  const deploymentCommit = argument("--deployment-commit")?.trim() ??
    process.env.INTELLIGENCE_EVALUATION_DEPLOYMENT_COMMIT?.trim();
  if (!deploymentCommit) {
    throw new Error("Pass --deployment-commit for the Ready production deployment being measured.");
  }
  const benchmarkStartedAt = new Date().toISOString();
  workspace.performance = { chart: [], search: [] };
  workspace.visibleWhyNowClaims = [];
  workspace.searches = workspace.searches.map((item) => ({
    ...item,
    retrievedResultIds: [],
    durationMs: null,
  }));
  const chartUrl = new URL("/api/intelligence/signals", baseUrl);
  chartUrl.searchParams.set("range", "365d");
  chartUrl.searchParams.set("q", "__five_series_performance_benchmark__");
  const currentTopicKeys = new Set(workspace.topicLabels.map((item) => item.signalKey));
  const comparisonKeys = [...new Set([
    ...workspace.surges
      .filter((item) => currentTopicKeys.has(item.signalKey))
      .map((item) => item.signalKey),
    ...workspace.topicLabels.map((item) => item.signalKey),
  ])].slice(0, 5);
  if (comparisonKeys.length !== 5) {
    throw new Error("Five complete-day signals are required for the chart benchmark.");
  }
  for (const signalKey of comparisonKeys) {
    chartUrl.searchParams.append("compare", signalKey);
  }
  const chart = await measuredFetch(chartUrl, cookie);
  if (chart.body.dataStatus !== "ready" ||
    compact(chart.body.completeThrough) !== workspace.dataQuality.provenance.completeThrough) {
    throw new Error("The chart endpoint is not Ready on the current accepted data window.");
  }
  const chartBodySignals = Array.isArray(chart.body.comparison) ? chart.body.comparison : [];
  if (chartBodySignals.length !== 5) {
    throw new Error(
      `The one-year chart benchmark requested five comparison series but received ${chartBodySignals.length}.`,
    );
  }
  for (const signal of chartBodySignals as DbRow[]) {
    const series = Array.isArray(signal.series) ? signal.series as DbRow[] : [];
    const dates = series.map((item) => dateKey(item.date)).filter(Boolean) as string[];
    const ordered = dates.every((date, index) =>
      index === 0 || date > dates[index - 1]
    );
    const populated = series.every((item) =>
      Number.isFinite(Number(item.shareOfCoverage)) &&
      Number.isFinite(Number(item.items)) &&
      Number.isFinite(Number(item.stories)) &&
      Number.isFinite(Number(item.sources))
    );
    if (
      series.length < 12 ||
      dates.length !== series.length ||
      !ordered ||
      !populated ||
      dates.at(-1)! < subtractIsoDays(workspace.dataQuality.provenance.completeThrough, 14)
    ) {
      throw new Error(
        "A requested comparison did not return at least 12 ordered, populated weekly points through the accepted window.",
      );
    }
  }
  workspace.performance.chart = [{
    requestId: "chart:five-series:365d",
    measuredAt: new Date().toISOString(),
    durationMs: chart.durationMs,
    status: chart.status,
    resultCount: chartBodySignals.length,
  }];
  const visibleUrl = new URL("/api/intelligence/signals", baseUrl);
  visibleUrl.searchParams.set("range", "90d");
  visibleUrl.searchParams.set("limit", "250");
  const visible = await measuredFetch(visibleUrl, cookie);
  if (visible.body.dataStatus !== "ready" ||
    compact(visible.body.completeThrough) !== workspace.dataQuality.provenance.completeThrough) {
    throw new Error("The visible-signal endpoint is not Ready on the accepted data window.");
  }
  const visibleSignals = Array.isArray(visible.body.signals) ? visible.body.signals as DbRow[] : [];
  if (!visibleSignals.length) {
    throw new Error("The signals response contained no visible signals to audit for Why now evidence.");
  }
  const visibleTotal = Number(visible.body.total ?? 0);
  if (visibleSignals.length !== Math.min(250, visibleTotal)) {
    throw new Error(
      `The visible-signal evidence audit expected ${Math.min(250, visibleTotal)} signals but received ${visibleSignals.length}.`,
    );
  }
  workspace.visibleWhyNowClaims = visibleWhyNowReviews(
    visibleSignals,
    workspace.dataQuality.provenance.completeThrough,
    [],
  );
  const searchSamples: PerformanceSample[] = [];
  for (const item of workspace.searches) {
    const searchUrl = new URL("/api/intelligence/search", baseUrl);
    searchUrl.searchParams.set("q", item.query);
    searchUrl.searchParams.set("limit", "10");
    const measured = await measuredFetch(searchUrl, cookie);
    if (measured.body.dataStatus && measured.body.dataStatus !== "ready") {
      throw new Error(`Search ${item.id} returned data status ${measured.body.dataStatus}.`);
    }
    const ranked = Array.isArray(measured.body.ranked) ? measured.body.ranked as DbRow[] : null;
    if (!ranked) {
      throw new Error("The search API did not return its unified ranked result contract.");
    }
    if (!ranked.length) throw new Error(`Search ${item.id} returned no ranked results.`);
    item.retrievedResultIds = [...new Set(ranked.map((row) => String(row.id)))].slice(0, 10);
    item.durationMs = measured.durationMs;
    searchSamples.push({
      requestId: item.id,
      measuredAt: new Date().toISOString(),
      durationMs: measured.durationMs,
      status: measured.status,
      resultCount: ranked.length,
    });
  }
  workspace.performance.search = searchSamples;
  workspace.benchmark = {
    baseUrl,
    deploymentCommit,
    completeThrough: workspace.dataQuality.provenance.completeThrough,
    startedAt: benchmarkStartedAt,
    completedAt: new Date().toISOString(),
    reviewFingerprint: workspace.reviewFingerprint,
    chartRequestCount: 1,
    searchRequestCount: searchSamples.length,
  };
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
    `| Story duplicate precision | ${display(report.metrics.duplicatePrecision.value)} |`,
    `| Story duplicate recall | ${display(report.metrics.duplicateRecall.value)} |`,
    `| Event duplicate precision | ${display(report.metrics.eventDuplicatePrecision.value)} |`,
    `| Event duplicate recall | ${display(report.metrics.eventDuplicateRecall.value)} |`,
    `| Segmentation acceptance | ${display(report.metrics.segmentationAcceptance.value)} |`,
    `| Event-to-topic precision | ${display(report.metrics.eventTopicLinkPrecision.value)} |`,
    `| False-trend rate | ${display(report.metrics.falseTrendRate.value)} |`,
    `| Search recall@10 | ${display(report.metrics.searchRecallAt10.value)} |`,
    `| Topic-label stability | ${display(report.metrics.topicLabelStability.value)} |`,
    `| Why-now evidence links | ${display(report.metrics.evidenceLinkCompleteness.value)} |`,
    `| Sampled Why-now claim links | ${display(report.metrics.sampledWhyNowClaimCompleteness.value)} |`,
    `| Fixed-window validation snapshots | ${report.metrics.validationSnapshotCount} |`,
    `| Chart maximum response | ${display(report.metrics.chartPerformance.maxMs, false)} |`,
    `| Search maximum response | ${display(report.metrics.searchPerformance.maxMs, false)} |`,
    `| Structured data-quality gates | ${report.gates.dataQualityGatesPass ? "Pass" : "Fail"} |`,
    `| Benchmark bound to accepted window | ${report.gates.benchmarkCurrent ? "Pass" : "Fail"} |`,
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
  if (workspace.schemaVersion !== INTELLIGENCE_EVALUATION_SCHEMA_VERSION) {
    throw new Error(`Evaluation workspace must use ${INTELLIGENCE_EVALUATION_SCHEMA_VERSION}.`);
  }
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
  if (command === "init" || command === "refresh") return initialize(command);
  if (command === "quality") return qualitySnapshot();
  if (command === "benchmark") return benchmark();
  if (command === "report") return report();
  throw new Error("Use init, refresh, quality, benchmark, or report.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
