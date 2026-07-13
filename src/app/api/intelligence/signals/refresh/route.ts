import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { runIntelligenceV2BackfillStep } from "@/lib/intelligence/signal-refresh-v2";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let ownerId: string | null = null;
  let runId: string | null = null;
  const admin = createAdminClient();
  try {
    ownerId = (await requireDashboardUser()).id;
    const body = (await request.json().catch(() => ({}))) as {
      phase?: "segmentation" | "terms" | "embeddings" | "concept_embeddings" | "topic_maintenance" | "dedupe" | "signals" | "all";
      cursor?: number;
      limit?: number;
    };
    const phase = body.phase ?? "all";
    const cursor = Math.max(0, Math.floor(Number(body.cursor ?? 0)));
    const resumable = await admin
      .from("intelligence_runs")
      .select("id,status,checkpoint_after")
      .eq("owner_id", ownerId)
      .eq("run_type", "backfill")
      .in("status", ["running", "partial"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (resumable.error) throw new Error(resumable.error.message);
    const existing = (resumable.data ?? []).find((run) => {
      const checkpoint = run.checkpoint_after as Record<string, unknown> | null;
      return checkpoint?.job === "intelligence_v2";
    });
    if (existing?.id) {
      runId = String(existing.id);
      const resumed = await admin.from("intelligence_runs").update({
        status: "running",
        heartbeat_at: new Date().toISOString(),
        error_summary: null,
        checkpoint_before: { job: "intelligence_v2", phase, cursor },
      }).eq("owner_id", ownerId).eq("id", runId);
      if (resumed.error) throw new Error(resumed.error.message);
    } else {
      const startedAt = new Date().toISOString();
      const created = await admin.from("intelligence_runs").insert({
        owner_id: ownerId,
        run_type: "backfill",
        status: "running",
        started_at: startedAt,
        heartbeat_at: startedAt,
        checkpoint_before: { job: "intelligence_v2", phase, cursor },
        checkpoint_after: { job: "intelligence_v2", phase, cursor },
      }).select("id").single();
      if (created.error) throw new Error(created.error.message);
      runId = String(created.data.id);
    }
    const result = await runIntelligenceV2BackfillStep(
      admin,
      ownerId,
      {
        phase,
        cursor,
        limit: Math.min(250, Math.max(1, Math.floor(Number(body.limit ?? 100)))),
      },
    );
    const resultRecord = result as unknown as Record<string, unknown>;
    const hasMore = resultRecord.hasMore === true;
    const complete = phase === "signals" && !hasMore;
    const finishedAt = new Date().toISOString();
    const saved = await admin.from("intelligence_runs").update({
      status: complete ? "completed" : "running",
      heartbeat_at: finishedAt,
      completed_at: complete ? finishedAt : null,
      checkpoint_after: {
        job: "intelligence_v2",
        phase: complete ? "complete" : phase,
        completed_phase: complete ? phase : null,
        cursor,
        nextCursor: resultRecord.nextCursor ?? null,
        hasMore,
        result: resultRecord,
      },
    }).eq("owner_id", ownerId).eq("id", runId);
    if (saved.error) throw new Error(saved.error.message);
    return NextResponse.json({ result: { ...resultRecord, runId } });
  } catch (error) {
    if (ownerId && runId) {
      await admin.from("intelligence_runs").update({
        status: "partial",
        heartbeat_at: new Date().toISOString(),
        error_summary: error instanceof Error ? error.message : "Signal refresh failed.",
      }).eq("owner_id", ownerId).eq("id", runId);
    }
    console.error("[intelligence] V2 signal refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signal refresh failed." },
      { status: 500 },
    );
  }
}
