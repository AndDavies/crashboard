import { NextResponse } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { refreshTrendSnapshots } from "@/lib/intelligence/trends";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const ownerId = (await requireDashboardUser()).id;
    const result = await refreshTrendSnapshots(createAdminClient(), ownerId);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Trend refresh failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trend refresh failed." },
      { status: 500 },
    );
  }
}
