import type { SupabaseClient } from "@supabase/supabase-js";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "@/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import { loadActiveIntelligenceSignalGeneration } from "@/lib/intelligence/signal-generations-v2";

type IntelligenceRun = {
  run_type?: unknown;
  status?: unknown;
  checkpoint_after?: unknown;
};

export type IntelligenceSignalsV2DataStatus =
  | "ready"
  | "stale"
  | "disabled"
  | "building"
  | "schema_missing";

export type IntelligenceSignalsV2DataState = {
  status: IntelligenceSignalsV2DataStatus;
  completeThrough: string;
  expectedCompleteThrough: string;
  refreshId: string | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function validDateKey(value: unknown) {
  const candidate = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : null;
}

function missingSignalSchema(error: { code?: unknown } | null | undefined) {
  return ["42P01", "PGRST202", "PGRST205", "42883"].includes(
    String(error?.code ?? ""),
  );
}

export function intelligenceSignalsV2Enabled() {
  return ["1", "true", "on", "yes"].includes(
    process.env.INTELLIGENCE_SIGNALS_V2?.trim().toLowerCase() ?? "",
  );
}

export function intelligenceAutomaticResearchEnabled() {
  return ["1", "true", "on", "yes"].includes(
    process.env.INTELLIGENCE_AUTOMATIC_RESEARCH_ENABLED?.trim().toLowerCase() ?? "",
  );
}

export function isCompletedIntelligenceV2BackfillRun(run: IntelligenceRun) {
  const checkpoint = object(run.checkpoint_after);
  return run.status === "completed" &&
    checkpoint.job === "intelligence_v2" &&
    checkpoint.phase === "complete";
}

/**
 * Reads the immutable complete-day boundary recorded by a finished v2 writer.
 * Partial writers are deliberately excluded even when they have already
 * written some rows for their pinned date.
 */
export function completedIntelligenceV2SignalDate(run: IntelligenceRun) {
  if (run.status !== "completed") return null;
  if (run.run_type === "backfill" && !isCompletedIntelligenceV2BackfillRun(run)) {
    return null;
  }
  if (run.run_type !== undefined && !["backfill", "signal_refresh"].includes(String(run.run_type))) {
    return null;
  }
  const checkpoint = object(run.checkpoint_after);
  const result = object(checkpoint.result);
  const signals = object(result.signals);
  const continuation = object(checkpoint.signal_continuation);
  const metricVersion = String(
    checkpoint.metric_version
      ?? checkpoint.metricVersion
      ?? signals.metricVersion
      ?? "",
  );
  if (metricVersion && metricVersion !== INTELLIGENCE_SIGNAL_METRIC_VERSION) return null;
  return [
    checkpoint.complete_through,
    checkpoint.signal_complete_through,
    checkpoint.completeThrough,
    result.completeThrough,
    signals.completeThrough,
    continuation.completeThrough,
  ].map(validDateKey).find((value): value is string => Boolean(value)) ?? null;
}

export async function hasCompletedIntelligenceV2Backfill(
  admin: SupabaseClient,
  ownerId: string,
) {
  const result = await admin
    .from("intelligence_runs")
    .select("status,checkpoint_after,created_at")
    .eq("owner_id", ownerId)
    .eq("run_type", "backfill")
    .order("created_at", { ascending: false })
    .limit(30);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []).some(isCompletedIntelligenceV2BackfillRun);
}

export async function intelligenceSignalsV2DataState(
  admin: SupabaseClient,
  ownerId: string,
  expectedCompleteThrough = latestCompleteDateKey(),
): Promise<IntelligenceSignalsV2DataState> {
  if (!intelligenceSignalsV2Enabled()) {
    return {
      status: "disabled",
      completeThrough: expectedCompleteThrough,
      expectedCompleteThrough,
      refreshId: null,
    };
  }
  if (!(await hasCompletedIntelligenceV2Backfill(admin, ownerId))) {
    return {
      status: "building",
      completeThrough: expectedCompleteThrough,
      expectedCompleteThrough,
      refreshId: null,
    };
  }
  let active;
  try {
    active = await loadActiveIntelligenceSignalGeneration(
      admin,
      ownerId,
      INTELLIGENCE_SIGNAL_METRIC_VERSION,
    );
  } catch (error) {
    if (missingSignalSchema(error as { code?: unknown })) {
      return {
        status: "schema_missing",
        completeThrough: expectedCompleteThrough,
        expectedCompleteThrough,
        refreshId: null,
      };
    }
    throw error;
  }
  if (!active || active.completeThrough > expectedCompleteThrough) {
    return {
      status: "building",
      completeThrough: expectedCompleteThrough,
      expectedCompleteThrough,
      refreshId: null,
    };
  }
  const completeThrough = active.completeThrough;
  return {
    status: completeThrough === expectedCompleteThrough ? "ready" : "stale",
    completeThrough,
    expectedCompleteThrough,
    refreshId: active.refreshId,
  };
}

export async function intelligenceSignalsV2DataStatus(
  admin: SupabaseClient,
  ownerId: string,
): Promise<IntelligenceSignalsV2DataStatus> {
  return (await intelligenceSignalsV2DataState(admin, ownerId)).status;
}
