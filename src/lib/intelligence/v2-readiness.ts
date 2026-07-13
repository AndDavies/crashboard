import type { SupabaseClient } from "@supabase/supabase-js";

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
