import { NextResponse, type NextRequest } from "next/server";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import { runResearchQueue } from "@/lib/intelligence/research";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  intelligenceAutomaticResearchEnabled,
  intelligenceSignalsV2DataStatus,
} from "@/lib/intelligence/v2-readiness";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }
  if (!intelligenceAutomaticResearchEnabled()) {
    return NextResponse.json({
      skipped: true,
      reason: "Automatic research is disabled.",
    });
  }
  try {
    const admin = createAdminClient();
    const ownerId = cronOwnerId();
    const dataStatus = await intelligenceSignalsV2DataStatus(admin, ownerId);
    if (dataStatus !== "ready") {
      return NextResponse.json({
        skipped: true,
        reason: `Canonical v2 signals are ${dataStatus}; research stayed queued.`,
      });
    }
    const result = await runResearchQueue(admin, ownerId);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Scheduled research failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduled research failed." },
      { status: 500 },
    );
  }
}
