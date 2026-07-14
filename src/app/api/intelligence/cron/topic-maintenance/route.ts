import { NextResponse, type NextRequest } from "next/server";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import {
  drainTopicMaintenancePages,
  topicMaintenanceCronResume,
} from "@/lib/intelligence/topic-maintenance-runner";
import { runTopicMaintenance } from "@/lib/intelligence/topic-maintenance-v2";
import { createAdminClient } from "@/lib/supabase/admin";
import { intelligenceUsesTurso } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 300;

const TOPIC_MAINTENANCE_ASSIGNMENT_PAGE_LIMIT = 400;
const TOPIC_MAINTENANCE_GRAPH_PAGE_LIMIT = 5;
const TOPIC_MAINTENANCE_MAX_PAGES = 60;
const TOPIC_MAINTENANCE_WORK_BUDGET_MS = 210_000;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (intelligenceUsesTurso()) return NextResponse.json({ skipped: true, reason: "Topic maintenance is owned by the local Codex worker." });
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }
  const admin = createAdminClient();
  const ownerId = cronOwnerId();
  const startedAt = new Date().toISOString();
  const deadlineAtMs = Date.now() + TOPIC_MAINTENANCE_WORK_BUDGET_MS;
  let runId: string | null = null;
  let cursor = 0;
  let topicWindowStart: string | undefined;
  let persistedCheckpoint: Record<string, unknown> | null = null;
  try {
    const previous = await admin.from("intelligence_runs")
      .select("status,checkpoint_after")
      .eq("owner_id", ownerId)
      .eq("run_type", "topic_maintenance")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous.error) throw new Error(previous.error.message);
    const checkpoint = previous.data?.checkpoint_after as {
      hasMore?: boolean;
      nextCursor?: number | null;
      windowStart?: string;
    } | null;
    const resume = topicMaintenanceCronResume({
      status: previous.data?.status,
      hasMore: checkpoint?.hasMore,
      nextCursor: checkpoint?.nextCursor,
      windowStart: checkpoint?.windowStart,
    });
    cursor = resume.cursor;
    topicWindowStart = resume.windowStart;
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
    let discoveredCount = 0;
    let processedCount = 0;
    const drained = await drainTopicMaintenancePages({
      initialCursor: cursor,
      deadlineAtMs,
      maxPages: TOPIC_MAINTENANCE_MAX_PAGES,
      runPage: (pageCursor) => runTopicMaintenance(admin, ownerId, {
        cursor: pageCursor,
        segmentLimit: TOPIC_MAINTENANCE_ASSIGNMENT_PAGE_LIMIT,
        graphLimit: TOPIC_MAINTENANCE_GRAPH_PAGE_LIMIT,
        windowStart: topicWindowStart,
      }),
      checkpoint: async ({ page, cursor: pageCursor, resumeCursor, result }) => {
        topicWindowStart = result.windowStart;
        discoveredCount += result.considered;
        processedCount += result.createdCandidates.length + result.autoMergedAliases.length;
        const heartbeatAt = new Date().toISOString();
        const checkpoint = {
          ...result,
          cron: {
            page,
            pageCursor,
            resumeCursor,
            assignmentPageLimit: TOPIC_MAINTENANCE_ASSIGNMENT_PAGE_LIMIT,
            graphPageLimit: TOPIC_MAINTENANCE_GRAPH_PAGE_LIMIT,
          },
        };
        const update = await admin.from("intelligence_runs").update({
          status: result.hasMore ? "partial" : "completed",
          discovered_count: discoveredCount,
          processed_count: processedCount,
          checkpoint_after: checkpoint,
          heartbeat_at: heartbeatAt,
          completed_at: result.hasMore ? null : heartbeatAt,
        }).eq("id", runId);
        if (update.error) throw new Error(update.error.message);
        persistedCheckpoint = checkpoint;
        if (resumeCursor !== null) cursor = resumeCursor;
      },
    });
    return NextResponse.json({
      result: drained.result,
      pagesProcessed: drained.pagesProcessed,
      complete: drained.complete,
      resumeCursor: drained.resumeCursor,
    });
  } catch (error) {
    if (runId) {
      const completedAt = new Date().toISOString();
      await admin
        .from("intelligence_runs")
        .update({
          status: "failed",
          error_summary: error instanceof Error ? error.message : "Topic maintenance failed.",
          checkpoint_after: {
            ...(persistedCheckpoint ?? {}),
            cursor,
            hasMore: true,
            nextCursor: cursor,
          },
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
