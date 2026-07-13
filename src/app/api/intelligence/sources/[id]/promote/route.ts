import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { promoteResearchSource } from "@/lib/intelligence/research";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [user, params] = await Promise.all([requireDashboardUser(), context.params]);
    const source = await promoteResearchSource(
      createAdminClient(),
      user.id,
      params.id,
    );
    return NextResponse.json({ result: source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source promotion failed.";
    return NextResponse.json(
      { error: message },
      { status: message === "Source not found." ? 404 : 500 },
    );
  }
}

