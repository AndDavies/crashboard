import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cronOwnerId,
  isHalifaxHour,
  verifyIntelligenceCron,
} from "@/lib/intelligence/cron";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status });
  }
  if (!isHalifaxHour(6)) {
    return NextResponse.json({ skipped: true, reason: "Outside 06:00 Halifax gate." });
  }

  try {
    const result = await refreshTrendSnapshots(createAdminClient(), cronOwnerId(), new Date(), {
      currentWindowsOnly: true,
    });
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Scheduled trend refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduled trend refresh failed." },
      { status: 500 },
    );
  }
}
