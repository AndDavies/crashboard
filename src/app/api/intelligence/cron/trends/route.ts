import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cronOwnerId,
  isHalifaxHour,
  verifyIntelligenceCron,
} from "@/lib/intelligence/cron";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";
import { refreshSignalsV2 } from "@/lib/intelligence/signal-refresh-v2";
import { sendImmediateIntelligenceAlerts } from "@/lib/intelligence/immediate-alerts";
import { runDailyIntelligenceV2Maintenance } from "@/lib/intelligence/daily-maintenance-v2";
import { isCompletedIntelligenceV2BackfillRun } from "@/lib/intelligence/v2-readiness";

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
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }

  const admin = createAdminClient();
  const ownerId = cronOwnerId();
  const startedAt = new Date().toISOString();
  let runId: string | null = null;
  let maintenance: Awaited<ReturnType<typeof runDailyIntelligenceV2Maintenance>> | null = null;
  try {
    const [previousRefresh, recentBackfills, previousPartial] = await Promise.all([
      admin.from("intelligence_runs")
        .select("completed_at")
        .eq("owner_id", ownerId)
        .eq("run_type", "signal_refresh")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("intelligence_runs")
        .select("status,checkpoint_after,completed_at")
        .eq("owner_id", ownerId)
        .eq("run_type", "backfill")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(30),
      admin.from("intelligence_runs")
        .select("checkpoint_after,created_at")
        .eq("owner_id", ownerId)
        .eq("run_type", "signal_refresh")
        .eq("status", "partial")
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
    const run = await admin
      .from("intelligence_runs")
      .insert({
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
        },
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    runId = String(run.data.id);
    // Daily Gmail ingestion can add up to 25 messages with up to 25 retained
    // editorial segments each. Fill their v2 inputs and rebuild duplicate links
    // before either scoring implementation reads the archive.
    maintenance = await runDailyIntelligenceV2Maintenance(admin, ownerId, {
      since: maintenanceSince,
      segmentOffset,
      conceptOffset,
    });
    const maintenanceCheckpoint = await admin.from("intelligence_runs").update({
      heartbeat_at: new Date().toISOString(),
      discovered_count: maintenance.scan.segments,
      checkpoint_after: {
        phase: maintenance.complete ? "scoring" : "daily_v2_maintenance",
        continuation: maintenance.continuation,
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
    // Keep the legacy snapshots as a read-only rollback while v2 builds the
    // canonical daily series used by the simple interface and research queue.
    const [legacy, v2] = await Promise.all([
      refreshTrendSnapshots(admin, ownerId, new Date(), {
        currentWindowsOnly: true,
      }),
      refreshSignalsV2(admin, ownerId),
    ]);
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
      await admin
        .from("intelligence_runs")
        .update({
          status: "failed",
          error_summary: error instanceof Error ? error.message : "Scheduled trend refresh failed.",
          checkpoint_after: {
            phase: "failed",
            continuation: null,
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
  }
}
