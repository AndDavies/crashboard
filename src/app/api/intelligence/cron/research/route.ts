import { NextResponse, type NextRequest } from "next/server";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import { runResearchQueue } from "@/lib/intelligence/research";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }
  try {
    const admin = createAdminClient();
    const latestRefresh = await admin
      .from("intelligence_signal_daily")
      .select("computed_at")
      .eq("owner_id", cronOwnerId())
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestRefresh.error) throw new Error(latestRefresh.error.message);
    const refreshedAt = Date.parse(latestRefresh.data?.computed_at ?? "");
    if (!Number.isFinite(refreshedAt) || refreshedAt < Date.now() - 4 * 60 * 60 * 1_000) {
      return NextResponse.json({
        skipped: true,
        reason: "Today's signal refresh has not completed; research stayed queued.",
      });
    }
    const result = await runResearchQueue(admin, cronOwnerId());
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Scheduled research failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduled research failed." },
      { status: 500 },
    );
  }
}
