import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cronOwnerId,
  isHalifaxHour,
  verifyIntelligenceCron,
} from "@/lib/intelligence/cron";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";
import { refreshSignalsV2Batch } from "@/lib/intelligence/signal-refresh-v2";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "@/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import { sendImmediateIntelligenceAlerts } from "@/lib/intelligence/immediate-alerts";
import { runDailyIntelligenceV2Maintenance } from "@/lib/intelligence/daily-maintenance-v2";
import {
  isCompletedIntelligenceV2BackfillRun,
} from "@/lib/intelligence/v2-readiness";
import { legacySignalAnchorForCompleteThrough } from "@/lib/intelligence/local-signal-refresh";
import {
  claimSignalRefreshLease,
  releaseSignalRefreshLease,
  requireSignalRefreshLease,
} from "@/lib/intelligence/signal-refresh-lease";
import { runIntelligenceV2Retention } from "@/lib/intelligence/retention-v2";
import { loadActiveIntelligenceSignalGeneration } from "@/lib/intelligence/signal-generations-v2";
import { intelligenceUsesTurso } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 300;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }
  if (intelligenceUsesTurso()) {
    return NextResponse.json({ skipped: true, reason: "Trend refresh is owned by the local Codex worker." });
  }
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }

  const admin = createAdminClient();
  const ownerId = cronOwnerId();
  const startedAt = new Date().toISOString();
  const scoringDeadline = Date.now() + 230_000;
  let runId: string | null = null;
  let refreshLeaseToken: string | null = null;
  let refreshLeaseRunId: string | null = null;
  let maintenance: Awaited<ReturnType<typeof runDailyIntelligenceV2Maintenance>> | null = null;
  let signalContinuation: Record<string, unknown> | null = null;
  const renewRefreshLease = async () => {
    if (!refreshLeaseToken || !refreshLeaseRunId) {
      throw new Error("Scheduled signal refresh lease was not initialized.");
    }
    await requireSignalRefreshLease(admin, {
      ownerId,
      leaseToken: refreshLeaseToken,
      holderRunId: refreshLeaseRunId,
      holderKind: "scheduled",
    });
  };
  try {
    const [previousRefresh, recentBackfills, previousPartial] = await Promise.all([
      admin.from("intelligence_runs")
        .select("run_type,status,completed_at,checkpoint_after")
        .eq("owner_id", ownerId)
        .eq("run_type", "signal_refresh")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("intelligence_runs")
        .select("id,status,checkpoint_after,completed_at")
        .eq("owner_id", ownerId)
        .eq("run_type", "backfill")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(30),
      admin.from("intelligence_runs")
        .select("id,status,heartbeat_at,checkpoint_after,created_at")
        .eq("owner_id", ownerId)
        .eq("run_type", "signal_refresh")
        .in("status", ["running", "partial"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const lookupError = previousRefresh.error ?? recentBackfills.error ?? previousPartial.error;
    if (lookupError) throw new Error(lookupError.message);
    const completedBackfill = (recentBackfills.data ?? [])
      .find(isCompletedIntelligenceV2BackfillRun);
    const completedWatermarks = [
      Date.parse(previousRefresh.data?.completed_at ?? ""),
      Date.parse(completedBackfill?.completed_at ?? ""),
    ].filter(Number.isFinite);
    const previousCompletedAt = completedWatermarks.length
      ? Math.max(...completedWatermarks)
      : Number.NaN;
    // The small overlap covers rows committed at the edge of the preceding run.
    // With neither a scheduled refresh nor a completed v2 backfill, 48 hours
    // safely includes the latest Gmail sync without becoming an archive backfill.
    let maintenanceSince = new Date(
      Number.isFinite(previousCompletedAt)
        ? previousCompletedAt - 10 * 60 * 1_000
        : Date.parse(startedAt) - 48 * 60 * 60 * 1_000,
    ).toISOString();
    let segmentOffset = 0;
    let conceptOffset = 0;
    const partialCreatedAt = Date.parse(previousPartial.data?.created_at ?? "");
    const partialContinuation = object(
      object(previousPartial.data?.checkpoint_after).continuation,
    );
    const savedSignalContinuation = object(
      object(previousPartial.data?.checkpoint_after).signal_continuation,
    );
    let signalCursor = 0;
    let signalRefreshId = "";
    let signalRefreshStartedAt = startedAt;
    let signalCompleteThrough: string | undefined;
    let signalHistoryDays = 395;
    let signalEventDedupGenerationId: string | null | undefined;
    let signalStoryDedupGenerationId: string | null | undefined;
    const partialSince = String(partialContinuation.maintenanceSince ?? "");
    if (
      partialContinuation.required === true &&
      partialContinuation.strategy === "oldest_unfinished_first" &&
      Number.isFinite(Date.parse(partialSince)) &&
      Number.isFinite(partialCreatedAt) &&
      (!Number.isFinite(previousCompletedAt) || partialCreatedAt > previousCompletedAt)
    ) {
      maintenanceSince = new Date(partialSince).toISOString();
      segmentOffset = Math.max(0, Math.floor(Number(partialContinuation.segmentOffset ?? 0)));
      conceptOffset = Math.max(0, Math.floor(Number(partialContinuation.conceptOffset ?? 0)));
    }
    const savedSignalCursor = Math.floor(Number(savedSignalContinuation.cursor ?? 0));
    const savedSignalStartedAt = String(savedSignalContinuation.refreshStartedAt ?? "");
    if (
      savedSignalContinuation.required === true
      && savedSignalContinuation.strategy === "term_signal_v2"
      && Number.isFinite(savedSignalCursor)
      && savedSignalCursor >= 0
      && String(savedSignalContinuation.refreshId ?? "")
      && Number.isFinite(Date.parse(savedSignalStartedAt))
      && Number.isFinite(partialCreatedAt)
      && (!Number.isFinite(previousCompletedAt) || partialCreatedAt > previousCompletedAt)
    ) {
      signalCursor = savedSignalCursor;
      signalRefreshId = String(savedSignalContinuation.refreshId);
      signalRefreshStartedAt = new Date(savedSignalStartedAt).toISOString();
      const savedCompleteThrough = String(savedSignalContinuation.completeThrough ?? "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(savedCompleteThrough)) {
        signalCompleteThrough = savedCompleteThrough;
      }
      const savedHistoryDays = Number(savedSignalContinuation.historyDays ?? 395);
      signalHistoryDays = Number.isFinite(savedHistoryDays)
        ? Math.min(730, Math.max(112, Math.floor(savedHistoryDays)))
        : 395;
      if (Object.prototype.hasOwnProperty.call(
        savedSignalContinuation,
        "eventDedupGenerationId",
      )) {
        signalEventDedupGenerationId = savedSignalContinuation
          .eventDedupGenerationId === null
          ? null
          : String(savedSignalContinuation.eventDedupGenerationId ?? "").trim() || null;
      }
      if (Object.prototype.hasOwnProperty.call(
        savedSignalContinuation,
        "storyDedupGenerationId",
      )) {
        signalStoryDedupGenerationId = savedSignalContinuation
          .storyDedupGenerationId === null
          ? null
          : String(savedSignalContinuation.storyDedupGenerationId ?? "").trim() || null;
      }
      signalContinuation = {
        ...savedSignalContinuation,
        cursor: signalCursor,
        refreshId: signalRefreshId,
        refreshStartedAt: signalRefreshStartedAt,
        historyDays: signalHistoryDays,
        ...(signalEventDedupGenerationId !== undefined
          ? { eventDedupGenerationId: signalEventDedupGenerationId }
          : {}),
        ...(signalStoryDedupGenerationId !== undefined
          ? { storyDedupGenerationId: signalStoryDedupGenerationId }
          : {}),
      };
    }
    signalCompleteThrough ??= latestCompleteDateKey();
    const activeSignalGeneration = await loadActiveIntelligenceSignalGeneration(
      admin,
      ownerId,
      INTELLIGENCE_SIGNAL_METRIC_VERSION,
    );
    const unfinishedRefreshId = String(savedSignalContinuation.refreshId ?? "").trim();
    const activeGenerationNeedsResume =
      activeSignalGeneration?.completeThrough === signalCompleteThrough &&
      savedSignalContinuation.required === true &&
      unfinishedRefreshId === activeSignalGeneration.refreshId;
    if (
      activeSignalGeneration?.completeThrough === signalCompleteThrough &&
      !activeGenerationNeedsResume
    ) {
      // The paired, guarded cron runs every ten minutes during the one valid
      // Halifax hour. Once today's canonical generation is complete, use each
      // remaining invocation for one bounded retention page instead of
      // recalculating the same series. A rolling deployment can briefly expose
      // application code before the RPC migration; that is a safe no-op.
      let retention: Awaited<ReturnType<typeof runIntelligenceV2Retention>> | {
        available: false;
        failed: true;
        error: string;
      };
      try {
        retention = await runIntelligenceV2Retention(admin, ownerId);
      } catch (error) {
        console.error("[intelligence] Bounded v2 retention failed.", error);
        retention = {
          available: false,
          failed: true,
          error: error instanceof Error ? error.message : "Bounded retention failed.",
        };
      }
      let recoveredRun = false;
      const unfinishedHeartbeat = Date.parse(previousPartial.data?.heartbeat_at ?? "");
      const staleUnfinished = Number.isFinite(unfinishedHeartbeat) &&
        Date.now() - unfinishedHeartbeat >= 6 * 60 * 1_000;
      if (
        previousPartial.data?.id &&
        staleUnfinished &&
        savedSignalContinuation.required === false &&
        unfinishedRefreshId === activeSignalGeneration.refreshId
      ) {
        const recoveredAt = new Date().toISOString();
        const checkpoint = object(previousPartial.data.checkpoint_after);
        let recovery = admin.from("intelligence_runs").update({
          status: "completed",
          heartbeat_at: recoveredAt,
          completed_at: recoveredAt,
          processed_count: activeSignalGeneration.signalCount,
          error_summary: null,
          checkpoint_after: {
            ...checkpoint,
            phase: "complete",
            metric_version: activeSignalGeneration.metricVersion,
            refresh_id: activeSignalGeneration.refreshId,
            complete_through: activeSignalGeneration.completeThrough,
            v2_signal_count: activeSignalGeneration.signalCount,
            v2_daily_row_count: activeSignalGeneration.dailyRowCount,
            recovered_after_atomic_activation: true,
          },
        }).eq("owner_id", ownerId)
          .eq("id", previousPartial.data.id)
          .eq("status", previousPartial.data.status);
        recovery = previousPartial.data.heartbeat_at
          ? recovery.eq("heartbeat_at", previousPartial.data.heartbeat_at)
          : recovery.is("heartbeat_at", null);
        const recovered = await recovery.select("id").maybeSingle();
        if (recovered.error) {
          console.error("[intelligence] Active signal-run recovery failed.", recovered.error);
        } else {
          recoveredRun = Boolean(recovered.data);
        }
      }
      return NextResponse.json({
        skipped: true,
        reason: `The canonical signal series is already complete through ${signalCompleteThrough}.`,
        retention,
        recoveredRun,
      });
    }
    refreshLeaseToken = randomUUID();
    refreshLeaseRunId = randomUUID();
    const lease = await claimSignalRefreshLease(admin, {
      ownerId,
      leaseToken: refreshLeaseToken,
      holderRunId: refreshLeaseRunId,
      holderKind: "scheduled",
    });
    if (!lease.claimed) {
      return NextResponse.json({
        skipped: true,
        reason: "Another signal refresh is active.",
        holder: lease.holderKind,
        retryAfter: lease.expiresAt,
      }, { status: 202 });
    }
    const run = await admin
      .from("intelligence_runs")
      .insert({
        id: refreshLeaseRunId,
        owner_id: ownerId,
        run_type: "signal_refresh",
        status: "running",
        started_at: startedAt,
        heartbeat_at: startedAt,
        checkpoint_before: {
          phase: "daily_v2_maintenance",
          maintenance_since: maintenanceSince,
          segment_offset: segmentOffset,
          concept_offset: conceptOffset,
          complete_through: signalCompleteThrough,
        },
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    runId = String(run.data.id);
    signalRefreshId ||= runId;
    signalContinuation ??= {
      required: true,
      strategy: "term_signal_v2",
      cursor: signalCursor,
      refreshId: signalRefreshId,
      refreshStartedAt: signalRefreshStartedAt,
      completeThrough: signalCompleteThrough,
      historyDays: signalHistoryDays,
    };
    // Daily Gmail ingestion can add up to 25 messages with up to 25 retained
    // editorial segments each. Fill their v2 inputs and rebuild duplicate links
    // before either scoring implementation reads the archive.
    maintenance = await runDailyIntelligenceV2Maintenance(admin, ownerId, {
      since: maintenanceSince,
      completeThrough: signalCompleteThrough,
      segmentOffset,
      conceptOffset,
      dedupeLease: {
        leaseToken: refreshLeaseToken,
        holderRunId: refreshLeaseRunId,
        holderKind: "scheduled",
      },
    });
    await renewRefreshLease();
    const maintenanceCheckpoint = await admin.from("intelligence_runs").update({
      heartbeat_at: new Date().toISOString(),
      discovered_count: maintenance.scan.segments,
      checkpoint_after: {
        phase: maintenance.complete ? "scoring" : "daily_v2_maintenance",
        continuation: maintenance.continuation,
        signal_continuation: signalContinuation,
        maintenance,
      },
    }).eq("owner_id", ownerId).eq("id", runId);
    if (maintenanceCheckpoint.error) throw new Error(maintenanceCheckpoint.error.message);
    if (!maintenance.complete) {
      const partialAt = new Date().toISOString();
      const partial = await admin.from("intelligence_runs").update({
        status: "partial",
        error_summary: null,
        checkpoint_after: {
          phase: "daily_v2_maintenance",
          continuation: maintenance.continuation,
          signal_continuation: signalContinuation,
          maintenance,
        },
        heartbeat_at: partialAt,
        completed_at: partialAt,
      }).eq("owner_id", ownerId).eq("id", runId);
      if (partial.error) throw new Error(partial.error.message);
      return NextResponse.json({
        result: {
          deferred: true,
          reason: "Bounded maintenance has more inputs to process; scoring and alerts stayed unchanged.",
          maintenance,
        },
      }, { status: 202 });
    }
    // Each page is committed and checkpointed independently. A later cron
    // continues the same refresh generation instead of restarting at zero.
    let v2Page: Awaited<ReturnType<typeof refreshSignalsV2Batch>> | null = null;
    let signalPageCount = 0;
    let signalCount = 0;
    let dailyRowCount = 0;
    let observationCount = 0;
    let processedCandidateTermCount = 0;
    do {
      v2Page = await refreshSignalsV2Batch(admin, ownerId, {
        completeThrough: signalCompleteThrough,
        historyDays: signalHistoryDays,
        refreshId: signalRefreshId,
        refreshStartedAt: signalRefreshStartedAt,
        termCursor: signalCursor,
        eventDedupGenerationId: signalEventDedupGenerationId,
        storyDedupGenerationId: signalStoryDedupGenerationId,
      });
      await renewRefreshLease();
      signalCompleteThrough = v2Page.completeThrough;
      signalPageCount += 1;
      signalCount += v2Page.signalCount;
      dailyRowCount += v2Page.dailyRowCount;
      observationCount += v2Page.observationCount;
      processedCandidateTermCount += v2Page.processedCandidateTermCount;
      signalEventDedupGenerationId = v2Page.eventDedupGenerationId;
      signalStoryDedupGenerationId = v2Page.storyDedupGenerationId;
      const nextCursor = v2Page.nextCursor ?? signalCursor;
      signalContinuation = {
        required: v2Page.hasMore,
        strategy: "term_signal_v2",
        cursor: nextCursor,
        refreshId: signalRefreshId,
        refreshStartedAt: signalRefreshStartedAt,
        completeThrough: signalCompleteThrough,
        startDate: v2Page.startDate,
        historyDays: signalHistoryDays,
        ...(signalEventDedupGenerationId !== undefined
          ? { eventDedupGenerationId: signalEventDedupGenerationId }
          : {}),
        ...(signalStoryDedupGenerationId !== undefined
          ? { storyDedupGenerationId: signalStoryDedupGenerationId }
          : {}),
      };
      const savedPage = await admin.from("intelligence_runs").update({
        heartbeat_at: new Date().toISOString(),
        processed_count: signalCount,
        checkpoint_after: {
          phase: v2Page.hasMore ? "scoring" : "scoring_complete",
          continuation: maintenance.continuation,
          signal_continuation: signalContinuation,
          maintenance,
          signal_page_count: signalPageCount,
          v2_signal_count: signalCount,
          v2_daily_row_count: dailyRowCount,
        },
      }).eq("owner_id", ownerId).eq("id", runId);
      if (savedPage.error) throw new Error(savedPage.error.message);
      if (!v2Page.hasMore) break;
      if (v2Page.nextCursor === null || v2Page.nextCursor <= signalCursor) {
        throw new Error("Scheduled term signal refresh did not advance its saved cursor.");
      }
      signalCursor = v2Page.nextCursor;
      if (Date.now() >= scoringDeadline) {
        const partialAt = new Date().toISOString();
        const partial = await admin.from("intelligence_runs").update({
          status: "partial",
          error_summary: null,
          checkpoint_after: {
            phase: "scoring",
            continuation: maintenance.continuation,
            signal_continuation: signalContinuation,
            maintenance,
            signal_page_count: signalPageCount,
            v2_signal_count: signalCount,
            v2_daily_row_count: dailyRowCount,
          },
          heartbeat_at: partialAt,
          completed_at: partialAt,
        }).eq("owner_id", ownerId).eq("id", runId);
        if (partial.error) throw new Error(partial.error.message);
        return NextResponse.json({
          result: {
            deferred: true,
            reason: "Bounded signal scoring has more pages; the next scheduled run will resume the same refresh.",
            signalContinuation,
            maintenance,
          },
        }, { status: 202 });
      }
    } while (true);

    const v2 = {
      ...v2Page!,
      signalCount: v2Page!.signalCount,
      dailyRowCount: v2Page!.dailyRowCount,
      observationCount,
      processedCandidateTermCount,
      batchCount: signalPageCount,
      refreshId: signalRefreshId,
      refreshStartedAt: signalRefreshStartedAt,
    };
    // Keep the legacy snapshots as a read-only rollback, but only refresh them
    // after the canonical v2 generation is complete.
    await renewRefreshLease();
    const legacy = await refreshTrendSnapshots(
      admin,
      ownerId,
      legacySignalAnchorForCompleteThrough(v2Page!.completeThrough),
      {
        currentWindowsOnly: true,
      },
    );
    await renewRefreshLease();
    let immediateAlerts: Awaited<ReturnType<typeof sendImmediateIntelligenceAlerts>> | { skipped: true; reason: string; sent: 0 };
    try {
      immediateAlerts = await sendImmediateIntelligenceAlerts(admin, ownerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Immediate alert delivery failed.";
      console.error("[intelligence] Immediate alerts failed after signal refresh.", error);
      immediateAlerts = { skipped: true, reason: message, sent: 0 };
    }
    const completedAt = new Date().toISOString();
    const finish = await admin
      .from("intelligence_runs")
      .update({
        status: "completed",
        processed_count: v2.signalCount,
        checkpoint_after: {
          legacy_snapshot_count: legacy.snapshotCount,
          v2_signal_count: v2.signalCount,
          v2_daily_row_count: v2.dailyRowCount,
          metric_version: v2.metricVersion,
          backfill_run_id: completedBackfill?.id ?? null,
          refresh_id: signalRefreshId,
          refresh_started_at: signalRefreshStartedAt,
          complete_through: signalCompleteThrough,
          event_dedup_generation_id: signalEventDedupGenerationId ?? null,
          story_dedup_generation_id: signalStoryDedupGenerationId ?? null,
          maintenance,
          immediate_alerts: immediateAlerts,
        },
        heartbeat_at: completedAt,
        completed_at: completedAt,
      })
      .eq("id", runId);
    if (finish.error) throw new Error(finish.error.message);
    return NextResponse.json({ result: { legacy, v2, immediateAlerts } });
  } catch (error) {
    if (runId) {
      const completedAt = new Date().toISOString();
      const resumable = signalContinuation?.required === true;
      await admin
        .from("intelligence_runs")
        .update({
          status: resumable ? "partial" : "failed",
          error_summary: error instanceof Error ? error.message : "Scheduled trend refresh failed.",
          checkpoint_after: {
            phase: resumable ? "scoring" : "failed",
            continuation: maintenance?.continuation ?? null,
            signal_continuation: signalContinuation,
            maintenance,
          },
          heartbeat_at: completedAt,
          completed_at: completedAt,
        })
        .eq("id", runId);
    }
    console.error("[intelligence] Scheduled trend refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduled trend refresh failed." },
      { status: 500 },
    );
  } finally {
    if (refreshLeaseToken) {
      try {
        await releaseSignalRefreshLease(admin, {
          ownerId,
          leaseToken: refreshLeaseToken,
        });
      } catch (error) {
        console.error(
          "[intelligence] Signal refresh lease release failed; it will expire automatically.",
          error,
        );
      }
    }
  }
}
