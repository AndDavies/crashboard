import type { SupabaseClient } from "@supabase/supabase-js";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "@/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";

type IntelligenceRun = {
  status?: unknown;
  checkpoint_after?: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

export async function intelligenceSignalsV2DataStatus(
  admin: SupabaseClient,
  ownerId: string,
): Promise<"ready" | "disabled" | "building" | "schema_missing"> {
  if (!intelligenceSignalsV2Enabled()) return "disabled";
  if (!(await hasCompletedIntelligenceV2Backfill(admin, ownerId))) return "building";
  const latest = await admin
    .from("intelligence_signal_daily")
    .select("signal_date")
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .order("signal_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (["42P01", "PGRST205"].includes(String(latest.error?.code ?? ""))) {
    return "schema_missing";
  }
  if (latest.error) throw new Error(latest.error.message);
  return latest.data?.signal_date === latestCompleteDateKey() ? "ready" : "building";
}
