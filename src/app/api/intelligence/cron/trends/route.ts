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

export const runtime = "nodejs";
export const maxDuration = 300;

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
  try {
    const run = await admin
      .from("intelligence_runs")
      .insert({
        owner_id: ownerId,
        run_type: "signal_refresh",
        status: "running",
        started_at: startedAt,
        heartbeat_at: startedAt,
      })
      .select("id")
      .single();
    if (run.error) throw new Error(run.error.message);
    runId = String(run.data.id);
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
