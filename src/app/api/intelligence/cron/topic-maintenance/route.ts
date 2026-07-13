import { NextResponse, type NextRequest } from "next/server";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import { runTopicMaintenance } from "@/lib/intelligence/topic-maintenance-v2";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }
  const admin = createAdminClient();
  const ownerId = cronOwnerId();
  const startedAt = new Date().toISOString();
  let runId: string | null = null;
  let cursor = 0;
  try {
    const previous = await admin.from("intelligence_runs")
      .select("checkpoint_after")
      .eq("owner_id", ownerId)
      .eq("run_type", "topic_maintenance")
      .eq("status", "partial")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous.error) throw new Error(previous.error.message);
    const checkpoint = previous.data?.checkpoint_after as {
      hasMore?: boolean;
      nextCursor?: number | null;
    } | null;
    if (checkpoint?.hasMore && Number.isFinite(Number(checkpoint.nextCursor))) {
      cursor = Math.max(0, Number(checkpoint.nextCursor));
    }
    const run = await admin
      .from("intelligence_runs")
      .insert({
        owner_id: ownerId,
        run_type: "topic_maintenance",
        status: "running",
        started_at: startedAt,
        heartbeat_at: startedAt,
        checkpoint_before: { cursor },
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    runId = String(run.data.id);
    const result = await runTopicMaintenance(admin, ownerId, { cursor });
    const completedAt = new Date().toISOString();
    const finish = await admin
      .from("intelligence_runs")
      .update({
        status: result.hasMore ? "partial" : "completed",
        discovered_count: result.considered,
        processed_count:
          result.createdCandidates.length + result.autoMergedAliases.length,
        checkpoint_after: result,
        heartbeat_at: completedAt,
        completed_at: completedAt,
      })
      .eq("id", runId);
    if (finish.error) throw new Error(finish.error.message);
    return NextResponse.json({ result });
  } catch (error) {
    if (runId) {
      const completedAt = new Date().toISOString();
      await admin
        .from("intelligence_runs")
        .update({
          status: "failed",
          error_summary: error instanceof Error ? error.message : "Topic maintenance failed.",
          checkpoint_after: { cursor, hasMore: true, nextCursor: cursor },
          heartbeat_at: completedAt,
          completed_at: completedAt,
        })
        .eq("id", runId);
    }
    console.error("[intelligence] Topic maintenance failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Topic maintenance failed." },
      { status: 500 },
    );
  }
}
