import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cronOwnerId, isHalifaxHour, verifyIntelligenceCron } from "@/lib/intelligence/cron";
import {
  GMAIL_SYNC_TIME_BUDGET_MS,
  GmailSyncInProgressError,
  getGmailSource,
  syncGmailSource,
} from "@/lib/intelligence/jobs";
import { intelligenceUsesTurso } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const gate = verifyIntelligenceCron(request);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
  if (intelligenceUsesTurso()) return NextResponse.json({ skipped: true, reason: "Gmail sync is owned by the local Codex worker." });
  if (!isHalifaxHour(5)) return NextResponse.json({ skipped: true, reason: "Outside 05:00 Halifax gate." });

  try {
    const admin = createAdminClient();
    const source = await getGmailSource(admin, cronOwnerId());
    if (!source) return NextResponse.json({ error: "Gmail is not connected." }, { status: 409 });
    const result = await syncGmailSource(admin, source, {
      mode: "incremental",
      maxMessages: 25,
      timeBudgetMs: GMAIL_SYNC_TIME_BUDGET_MS,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof GmailSyncInProgressError) {
      return NextResponse.json(
        { skipped: true, reason: error.message },
        { status: 202 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scheduled sync failed." },
      { status: 500 },
    );
  }
}
