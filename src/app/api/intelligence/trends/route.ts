import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  rebuildConceptCooccurrence,
  rebuildProcurementCases,
} from "@/lib/intelligence/relationships";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      cursor?: number;
      limit?: number;
      rebuildRelationships?: boolean;
    };
    const cursor = Math.max(0, Math.floor(Number(body.cursor ?? 0)));
    const limit = Math.min(4, Math.max(1, Math.floor(Number(body.limit ?? 1))));
    const ownerId = (await requireDashboardUser()).id;
    const admin = createAdminClient();
    const rebuildRelationships = body.rebuildRelationships ?? cursor === 0;
    const procurement = rebuildRelationships
      ? await rebuildProcurementCases(admin, ownerId)
      : null;
    const cooccurrence = rebuildRelationships
      ? await rebuildConceptCooccurrence(admin, ownerId)
      : null;
    const result = await refreshTrendSnapshots(admin, ownerId, new Date(), {
      windowOffset: cursor,
      windowLimit: limit,
    });
    return NextResponse.json({ result: { ...result, procurement, cooccurrence } });
  } catch (error) {
    console.error("[intelligence] Trend refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trend refresh failed." },
      { status: 500 },
    );
  }
}
