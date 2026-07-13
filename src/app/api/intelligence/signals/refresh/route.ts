import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { runIntelligenceV2BackfillStep } from "@/lib/intelligence/signal-refresh-v2";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const ownerId = (await requireDashboardUser()).id;
    const body = (await request.json().catch(() => ({}))) as {
      phase?: "segmentation" | "terms" | "embeddings" | "concept_embeddings" | "topic_maintenance" | "dedupe" | "signals" | "all";
      cursor?: number;
      limit?: number;
    };
    const result = await runIntelligenceV2BackfillStep(
      createAdminClient(),
      ownerId,
      {
        phase: body.phase,
        cursor: Math.max(0, Math.floor(Number(body.cursor ?? 0))),
        limit: Math.min(250, Math.max(1, Math.floor(Number(body.limit ?? 100)))),
      },
    );
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] V2 signal refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signal refresh failed." },
      { status: 500 },
    );
  }
}
