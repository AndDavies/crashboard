import type { SupabaseClient } from "@supabase/supabase-js";

type DbObject = Record<string, unknown>;

export type IntelligenceSignalGeneration = {
  refreshId: string;
  metricVersion: string;
  startDate: string;
  completeThrough: string;
  generationStartedAt: string;
  status: "staging" | "active" | "retired";
  promote: boolean;
  signalCount: number;
  dailyRowCount: number;
  eventDedupGenerationId: string | null;
  storyDedupGenerationId: string | null;
  activatedAt: string | null;
  retiredAt: string | null;
};

export type IntelligenceEvaluationSignalSnapshot = {
  fingerprintVersion: "signal-fingerprint-v2.0.0";
  signalRowCount: number;
  signalSnapshotFingerprint: string;
  completeDaySignalCount: number;
  topicLabelCount: number;
  topicLabelFingerprint: string;
};

export type IntelligenceSignalGenerationPruneResult = {
  signalRowsDeleted: number;
  totalRowsDeleted: number;
  generationDeleted: boolean;
  alreadyPruned: boolean;
  hasMore: boolean;
};

function object(value: unknown): DbObject {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as DbObject
    : {};
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseStatus(value: unknown): IntelligenceSignalGeneration["status"] | null {
  return ["staging", "active", "retired"].includes(String(value))
    ? String(value) as IntelligenceSignalGeneration["status"]
    : null;
}

export function parseIntelligenceSignalGeneration(
  value: unknown,
): IntelligenceSignalGeneration | null {
  const row = object(value);
  const refreshId = String(row.refresh_id ?? row.refreshId ?? "").trim();
  const metricVersion = String(row.metric_version ?? row.metricVersion ?? "").trim();
  const startDate = String(row.start_date ?? row.startDate ?? "").slice(0, 10);
  const completeThrough = String(
    row.complete_through ?? row.completeThrough ?? row.end_date ?? row.endDate ?? "",
  ).slice(0, 10);
  const generationStartedAt = String(
    row.generation_started_at ?? row.generationStartedAt ?? "",
  ).trim();
  const status = parseStatus(row.status);
  if (
    !refreshId || !metricVersion || !status ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(completeThrough) ||
    !Number.isFinite(Date.parse(generationStartedAt))
  ) return null;
  return {
    refreshId,
    metricVersion,
    startDate,
    completeThrough,
    generationStartedAt: new Date(generationStartedAt).toISOString(),
    status,
    promote: row.promote !== false,
    signalCount: nonNegativeInteger(row.signal_count ?? row.signalCount),
    dailyRowCount: nonNegativeInteger(row.daily_row_count ?? row.dailyRowCount),
    eventDedupGenerationId: row.event_dedup_generation_id || row.eventDedupGenerationId
      ? String(row.event_dedup_generation_id ?? row.eventDedupGenerationId)
      : null,
    storyDedupGenerationId: row.story_dedup_generation_id || row.storyDedupGenerationId
      ? String(row.story_dedup_generation_id ?? row.storyDedupGenerationId)
      : null,
    activatedAt: row.activated_at || row.activatedAt
      ? String(row.activated_at ?? row.activatedAt)
      : null,
    retiredAt: row.retired_at || row.retiredAt
      ? String(row.retired_at ?? row.retiredAt)
      : null,
  };
}

export async function beginIntelligenceSignalGeneration(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    metricVersion: string;
    startDate: string;
    completeThrough: string;
    generationStartedAt: string;
    promote: boolean;
  },
) {
  const result = await admin.rpc("begin_intelligence_signal_generation", {
    query_owner: input.ownerId,
    query_refresh_id: input.refreshId,
    query_metric_version: input.metricVersion,
    query_start: input.startDate,
    query_end: input.completeThrough,
    query_generation_started_at: input.generationStartedAt,
    query_promote: input.promote,
  });
  if (result.error) {
    throw new Error(`Signal generation initialization failed: ${result.error.message}`);
  }
  const generation = parseIntelligenceSignalGeneration(result.data);
  if (!generation || generation.refreshId !== input.refreshId) {
    throw new Error("Signal generation initialization returned an invalid identity.");
  }
  return generation;
}

export async function completeIntelligenceSignalGeneration(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    metricVersion: string;
    startDate: string;
    completeThrough: string;
    generationStartedAt: string;
    finalOrdinal: number;
    promote: boolean;
    eventDedupGenerationId?: string | null;
    storyDedupGenerationId?: string | null;
  },
) {
  const result = await admin.rpc("complete_intelligence_signal_generation", {
    query_owner: input.ownerId,
    query_refresh_id: input.refreshId,
    query_metric_version: input.metricVersion,
    query_start: input.startDate,
    query_end: input.completeThrough,
    query_generation_started_at: input.generationStartedAt,
    query_final_ordinal: input.finalOrdinal,
    query_promote: input.promote,
    query_event_generation_id: input.eventDedupGenerationId ?? null,
    query_story_generation_id: input.storyDedupGenerationId ?? null,
  });
  if (result.error) {
    throw new Error(`Signal generation completion failed: ${result.error.message}`);
  }
  const generation = parseIntelligenceSignalGeneration(result.data);
  if (!generation || generation.refreshId !== input.refreshId) {
    throw new Error("Signal generation completion returned an invalid identity.");
  }
  if (input.promote && generation.status !== "active") {
    throw new Error("Canonical signal generation did not become active atomically.");
  }
  if (!input.promote && generation.status !== "retired") {
    throw new Error("Validation signal generation did not finalize as immutable retired data.");
  }
  return generation;
}

export async function loadActiveIntelligenceSignalGeneration(
  admin: SupabaseClient,
  ownerId: string,
  metricVersion: string,
) {
  const pointer = await admin
    .from("intelligence_signal_active_generations")
    .select("refresh_id")
    .eq("owner_id", ownerId)
    .eq("metric_version", metricVersion)
    .limit(1)
    .maybeSingle();
  if (pointer.error) throw pointer.error;
  const refreshId = String(pointer.data?.refresh_id ?? "").trim();
  if (!refreshId) return null;
  const result = await admin
    .from("intelligence_signal_generations")
    .select("refresh_id,metric_version,start_date,complete_through,generation_started_at,status,promote,signal_count,daily_row_count,event_dedup_generation_id,story_dedup_generation_id,activated_at,retired_at")
    .eq("owner_id", ownerId)
    .eq("metric_version", metricVersion)
    .eq("refresh_id", refreshId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  const generation = parseIntelligenceSignalGeneration(result.data);
  if (!generation || generation.refreshId !== refreshId) {
    throw new Error("The active signal-generation pointer is inconsistent.");
  }
  return generation;
}

export function parseIntelligenceEvaluationSignalSnapshot(
  value: unknown,
): IntelligenceEvaluationSignalSnapshot | null {
  const row = object(value);
  const signalRowCount = nonNegativeInteger(row.signalRowCount);
  const completeDaySignalCount = nonNegativeInteger(row.completeDaySignalCount);
  const topicLabelCount = nonNegativeInteger(row.topicLabelCount);
  const signalSnapshotFingerprint = String(row.signalSnapshotFingerprint ?? "").trim();
  const topicLabelFingerprint = String(row.topicLabelFingerprint ?? "").trim();
  const fingerprintVersion = String(row.fingerprintVersion ?? "").trim();
  if (
    fingerprintVersion !== "signal-fingerprint-v2.0.0" ||
    signalRowCount < 1 || completeDaySignalCount < 1 || topicLabelCount < 1 ||
    !signalSnapshotFingerprint || !topicLabelFingerprint
  ) return null;
  return {
    fingerprintVersion,
    signalRowCount,
    signalSnapshotFingerprint,
    completeDaySignalCount,
    topicLabelCount,
    topicLabelFingerprint,
  };
}

export async function loadIntelligenceEvaluationSignalSnapshot(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    metricVersion: string;
    startDate: string;
    completeThrough: string;
  },
) {
  const result = await admin.rpc("intelligence_v2_evaluation_signal_fingerprint", {
    query_owner: input.ownerId,
    query_start: input.startDate,
    query_complete_through: input.completeThrough,
    query_metric_version: input.metricVersion,
    query_refresh_id: input.refreshId,
  });
  if (result.error) {
    throw new Error(`Validation signal fingerprint failed: ${result.error.message}`);
  }
  const snapshot = parseIntelligenceEvaluationSignalSnapshot(result.data);
  if (!snapshot) throw new Error("Validation signal fingerprint was incomplete.");
  return snapshot;
}

export async function pruneIntelligenceSignalGeneration(
  admin: SupabaseClient,
  ownerId: string,
  refreshId: string,
  batchSize = 2_500,
): Promise<IntelligenceSignalGenerationPruneResult> {
  const result = await admin.rpc("prune_intelligence_signal_generation", {
    query_owner: ownerId,
    query_refresh_id: refreshId,
    query_batch_size: Math.min(2_500, Math.max(100, Math.floor(batchSize))),
  });
  if (result.error) {
    throw new Error(`Validation signal generation prune failed: ${result.error.message}`);
  }
  const row = object(result.data);
  return {
    signalRowsDeleted: nonNegativeInteger(
      row.signal_rows_deleted ?? row.signalRowsDeleted,
    ),
    totalRowsDeleted: nonNegativeInteger(
      row.total_rows_deleted ?? row.totalRowsDeleted,
    ),
    generationDeleted: row.generation_deleted === true || row.generationDeleted === true,
    alreadyPruned: row.already_pruned === true || row.alreadyPruned === true,
    hasMore: row.has_more === true || row.hasMore === true,
  };
}
