import { NextResponse } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  rebuildConceptCooccurrence,
  rebuildProcurementCases,
} from "@/lib/intelligence/relationships";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const ownerId = (await requireDashboardUser()).id;
    const admin = createAdminClient();
    const procurement = await rebuildProcurementCases(admin, ownerId);
    const cooccurrence = await rebuildConceptCooccurrence(admin, ownerId);
    const result = await refreshTrendSnapshots(admin, ownerId);
    return NextResponse.json({ result: { ...result, procurement, cooccurrence } });
  } catch (error) {
    console.error("[intelligence] Trend refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trend refresh failed." },
      { status: 500 },
    );
  }
}
