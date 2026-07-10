import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import { createAndSendIntelligenceDigest } from "@/lib/intelligence/digest";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (!isHalifaxHour(7)) return NextResponse.json({ skipped: true, reason: "Outside 07:00 Halifax gate." });
  try {
    const result = await createAndSendIntelligenceDigest(createAdminClient(), cronOwnerId());
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scheduled digest failed." }, { status: 500 });
  }
}
