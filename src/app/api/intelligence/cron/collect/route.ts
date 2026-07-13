import { NextResponse, type NextRequest } from "next/server";
import { collectExternalSources } from "@/lib/intelligence/collectors";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (!isHalifaxHour(4)) {
    return NextResponse.json({ skipped: true, reason: "Outside 04:00 Halifax gate." });
  }
  try {
    const result = await collectExternalSources(createAdminClient(), cronOwnerId());
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Scheduled source collection failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduled source collection failed." },
      { status: 500 },
    );
  }
}

