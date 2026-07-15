import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireDashboardUser } from "@/lib/blog/data";
import {
  analysisPhasePrecedesCheckpoint,
  isIntelligenceAnalysisPhase,
  savedSignalRefreshWindow,
  savedTopicMaintenanceResume,
  type IntelligenceAnalysisPhase,
} from "@/lib/intelligence/analysis-refresh";
import { runIntelligenceV2BackfillStep } from "@/lib/intelligence/signal-refresh-v2";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import {
  releaseSignalRefreshLease,
  requireSignalRefreshLease,
} from "@/lib/intelligence/signal-refresh-lease";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTursoIntelligenceStore, intelligenceUsesTurso } from "@/lib/intelligence/store";
import { intelligenceOwnerIdForUser } from "@/lib/intelligence/owner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let ownerId: string | null = null;
  let runId: string | null = null;
  let refreshStartedAt: string | undefined;
  let signalCompleteThrough: string | undefined;
  let signalHistoryDays = 395;
  let signalEventDedupGenerationId: string | null | undefined;
  let signalStoryDedupGenerationId: string | null | undefined;
  let topicWindowStart: string | undefined;
  let claimedHeartbeatAt: string | null = null;
  let refreshLease: {
    leaseToken: string;
    holderRunId: string;
    holderKind: "local_validation";
  } | null = null;
  const admin = createAdminClient();
  try {
    const user = await requireDashboardUser();
    ownerId = intelligenceUsesTurso() ? intelligenceOwnerIdForUser(user) : user.id;
    const body = (await request.json().catch(() => ({}))) as {
      phase?: unknown;
      cursor?: number;
      limit?: number;
    };
    if (intelligenceUsesTurso()) {
      const jobId = await getTursoIntelligenceStore().enqueueJob({
        ownerId,
        jobType: "daily_refresh",
        priority: 40,
        payload: { requestedPhase: body.phase ?? "agent", batchSize: body.limit ?? 100 },
      });
      return NextResponse.json({ result: { queued: true, jobId, hasMore: false, processed: 0 } }, { status: 202 });
    }
    if (body.phase === undefined || body.phase === "all") {
      return NextResponse.json(
        { error: "Select one resumable analysis phase; the unbounded 'all' operation is not supported." },
        { status: 400 },
      );
    }
    if (!isIntelligenceAnalysisPhase(body.phase)) {
      return NextResponse.json({ error: "Unknown Intelligence analysis phase." }, { status: 400 });
    }
    const phase: IntelligenceAnalysisPhase = body.phase;
    const cursor = Math.max(0, Math.floor(Number(body.cursor ?? 0)));
    let effectiveCursor = cursor;
    const requestedLimit = Math.min(250, Math.max(1, Math.floor(Number(body.limit ?? 100))));
    // Model-assisted newsletter splitting can consume most of a serverless
    // request window. Smaller resumable batches keep each checkpoint durable.
    const limit = phase === "segmentation"
      ? Math.min(10, requestedLimit)
      : phase === "embeddings"
        ? Math.max(100, requestedLimit)
        : requestedLimit;
    const resumable = await admin
      .from("intelligence_runs")
      .select("id,status,heartbeat_at,checkpoint_before,checkpoint_after")
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
      const checkpoint = existing.checkpoint_after as Record<string, unknown> | null;
      const checkpointBefore = existing.checkpoint_before as Record<string, unknown> | null;
      const checkpointResult = checkpoint?.result && typeof checkpoint.result === "object"
        ? checkpoint.result as Record<string, unknown>
        : null;
      const checkpointSignals = checkpointResult?.signals &&
          typeof checkpointResult.signals === "object" &&
          !Array.isArray(checkpointResult.signals)
        ? checkpointResult.signals as Record<string, unknown>
        : null;
      const hasCheckpointEventGeneration = Object.prototype.hasOwnProperty.call(
        checkpoint ?? {},
        "signal_event_dedup_generation_id",
      );
      const hasResultEventGeneration = Object.prototype.hasOwnProperty.call(
        checkpointSignals ?? {},
        "eventDedupGenerationId",
      );
      const savedEventGeneration = hasCheckpointEventGeneration
        ? checkpoint?.signal_event_dedup_generation_id
        : checkpointSignals?.eventDedupGenerationId;
      if (hasCheckpointEventGeneration || hasResultEventGeneration) {
        signalEventDedupGenerationId = savedEventGeneration === null
          ? null
          : String(savedEventGeneration ?? "").trim() || null;
      }
      const hasCheckpointStoryGeneration = Object.prototype.hasOwnProperty.call(
        checkpoint ?? {},
        "signal_story_dedup_generation_id",
      );
      const hasResultStoryGeneration = Object.prototype.hasOwnProperty.call(
        checkpointSignals ?? {},
        "storyDedupGenerationId",
      );
      const savedStoryGeneration = hasCheckpointStoryGeneration
        ? checkpoint?.signal_story_dedup_generation_id
        : checkpointSignals?.storyDedupGenerationId;
      if (hasCheckpointStoryGeneration || hasResultStoryGeneration) {
        signalStoryDedupGenerationId = savedStoryGeneration === null
          ? null
          : String(savedStoryGeneration ?? "").trim() || null;
      }
      const savedWindow = savedSignalRefreshWindow(checkpoint, checkpointResult);
      signalCompleteThrough = savedWindow.completeThrough ?? latestCompleteDateKey();
      signalHistoryDays = savedWindow.historyDays;
      if (phase === "signals") {
        const savedStartedAt = String(
          checkpoint?.signal_refresh_started_at
            ?? checkpointBefore?.signal_refresh_started_at
            ?? "",
        );
        refreshStartedAt = Number.isFinite(Date.parse(savedStartedAt))
          ? new Date(savedStartedAt).toISOString()
          : new Date().toISOString();
      }
      if (analysisPhasePrecedesCheckpoint(phase, checkpoint?.phase)) {
        return NextResponse.json({
          result: {
            phase,
            hasMore: false,
            nextCursor: null,
            skipped: true,
            resumePhase: checkpoint?.phase,
            runId,
          },
        });
      }
      const savedCursor = Number(checkpoint?.nextCursor);
      if (phase === "topic_maintenance") {
        const topicResume = savedTopicMaintenanceResume(checkpoint, checkpointResult);
        effectiveCursor = topicResume.cursor;
        topicWindowStart = topicResume.windowStart;
      } else if (
        checkpoint?.phase === phase &&
        Number.isFinite(savedCursor)
      ) {
        effectiveCursor = savedCursor;
      } else if (phase === "signals") {
        // Signal batches can delete stale rows only after every support/term
        // page is written. Never let a client jump ahead of the server-owned
        // checkpoint.
        effectiveCursor = 0;
      }
      refreshLease = {
        leaseToken: randomUUID(),
        holderRunId: runId,
        holderKind: "local_validation",
      };
      await requireSignalRefreshLease(admin, {
        ownerId,
        ...refreshLease,
        ttlSeconds: 1_800,
      });
      claimedHeartbeatAt = new Date().toISOString();
      let resumed = admin.from("intelligence_runs").update({
        status: "running",
        heartbeat_at: claimedHeartbeatAt,
        error_summary: null,
        checkpoint_before: {
          job: "intelligence_v2",
          phase,
          cursor: effectiveCursor,
          signal_complete_through: signalCompleteThrough,
          ...(refreshStartedAt ? { signal_refresh_started_at: refreshStartedAt } : {}),
        },
      }).eq("owner_id", ownerId).eq("id", runId).eq("status", existing.status);
      resumed = existing.heartbeat_at
        ? resumed.eq("heartbeat_at", existing.heartbeat_at)
        : resumed.is("heartbeat_at", null);
      const resumedResult = await resumed.select("id").maybeSingle();
      if (resumedResult.error) throw new Error(resumedResult.error.message);
      if (!resumedResult.data) {
        throw new Error(`Analysis run ${runId} was claimed concurrently.`);
      }
    } else {
      const startedAt = new Date().toISOString();
      runId = randomUUID();
      signalCompleteThrough = latestCompleteDateKey();
      if (phase === "signals") refreshStartedAt = startedAt;
      if (phase === "signals" || phase === "topic_maintenance") effectiveCursor = 0;
      refreshLease = {
        leaseToken: randomUUID(),
        holderRunId: runId,
        holderKind: "local_validation",
      };
      await requireSignalRefreshLease(admin, {
        ownerId,
        ...refreshLease,
        ttlSeconds: 1_800,
      });
      claimedHeartbeatAt = startedAt;
      const created = await admin.from("intelligence_runs").insert({
        id: runId,
        owner_id: ownerId,
        run_type: "backfill",
        status: "running",
        started_at: startedAt,
        heartbeat_at: startedAt,
        checkpoint_before: {
          job: "intelligence_v2",
          phase,
          cursor: effectiveCursor,
          signal_complete_through: signalCompleteThrough,
          ...(refreshStartedAt ? { signal_refresh_started_at: refreshStartedAt } : {}),
        },
        checkpoint_after: {
          job: "intelligence_v2",
          phase,
          cursor: effectiveCursor,
          signal_complete_through: signalCompleteThrough,
        },
      }).select("id").single();
      if (created.error) throw new Error(created.error.message);
    }
    const result = await runIntelligenceV2BackfillStep(
      admin,
      ownerId,
      {
        phase,
        cursor: effectiveCursor,
        limit,
        refreshId: runId ?? undefined,
        refreshStartedAt,
        completeThrough: signalCompleteThrough,
        historyDays: signalHistoryDays,
        windowStart: topicWindowStart,
        dedupeLease: refreshLease ?? undefined,
        eventDedupGenerationId: signalEventDedupGenerationId,
        storyDedupGenerationId: signalStoryDedupGenerationId,
      },
    );
    const resultRecord = result as unknown as Record<string, unknown>;
    const hasMore = resultRecord.hasMore === true;
    const complete = phase === "signals" && !hasMore;
    if (phase === "signals") {
      const signalResult = resultRecord.signals && typeof resultRecord.signals === "object"
        ? resultRecord.signals as Record<string, unknown>
        : resultRecord;
      const resultCompleteThrough = String(signalResult.completeThrough ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/u.test(resultCompleteThrough)) {
        signalCompleteThrough = resultCompleteThrough;
      }
      if (Object.prototype.hasOwnProperty.call(signalResult, "eventDedupGenerationId")) {
        signalEventDedupGenerationId = signalResult.eventDedupGenerationId === null
          ? null
          : String(signalResult.eventDedupGenerationId ?? "").trim() || null;
      }
      if (Object.prototype.hasOwnProperty.call(signalResult, "storyDedupGenerationId")) {
        signalStoryDedupGenerationId = signalResult.storyDedupGenerationId === null
          ? null
          : String(signalResult.storyDedupGenerationId ?? "").trim() || null;
      }
    }
    if (phase === "topic_maintenance") {
      const resultWindowStart = String(resultRecord.windowStart ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/u.test(resultWindowStart)) {
        topicWindowStart = resultWindowStart;
      }
    }
    const finishedAt = new Date().toISOString();
    const saved = await admin.from("intelligence_runs").update({
      status: complete ? "completed" : "running",
      heartbeat_at: finishedAt,
      completed_at: complete ? finishedAt : null,
      checkpoint_after: {
        job: "intelligence_v2",
        phase: complete ? "complete" : phase,
        completed_phase: complete ? phase : null,
        cursor: effectiveCursor,
        nextCursor: resultRecord.nextCursor ?? null,
        hasMore,
        ...(refreshStartedAt ? { signal_refresh_started_at: refreshStartedAt } : {}),
        ...(signalCompleteThrough
          ? { signal_complete_through: signalCompleteThrough }
          : {}),
        ...(phase === "signals" ? { signal_history_days: signalHistoryDays } : {}),
        ...(signalEventDedupGenerationId !== undefined
          ? { signal_event_dedup_generation_id: signalEventDedupGenerationId }
          : {}),
        ...(signalStoryDedupGenerationId !== undefined
          ? { signal_story_dedup_generation_id: signalStoryDedupGenerationId }
          : {}),
        ...(topicWindowStart ? { topic_window_start: topicWindowStart } : {}),
        result: resultRecord,
      },
    }).eq("owner_id", ownerId)
      .eq("id", runId)
      .eq("status", "running")
      .eq("heartbeat_at", claimedHeartbeatAt)
      .select("id")
      .maybeSingle();
    if (saved.error) throw new Error(saved.error.message);
    if (!saved.data) throw new Error(`Analysis run ${runId} lost its claimed checkpoint.`);
    return NextResponse.json({ result: { ...resultRecord, runId } });
  } catch (error) {
    if (ownerId && runId && claimedHeartbeatAt) {
      await admin.from("intelligence_runs").update({
        status: "partial",
        heartbeat_at: new Date().toISOString(),
        error_summary: error instanceof Error ? error.message : "Signal refresh failed.",
      }).eq("owner_id", ownerId)
        .eq("id", runId)
        .eq("status", "running")
        .eq("heartbeat_at", claimedHeartbeatAt);
    }
    console.error("[intelligence] V2 signal refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signal refresh failed." },
      { status: 500 },
    );
  } finally {
    if (ownerId && refreshLease) {
      try {
        await releaseSignalRefreshLease(admin, {
          ownerId,
          leaseToken: refreshLease.leaseToken,
        });
      } catch (error) {
        console.error(
          "[intelligence] Manual analysis lease release failed; it will expire automatically.",
          error,
        );
      }
    }
  }
}
