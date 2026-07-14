import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { requireBearerSecret } from "@/lib/http/verify-bearer-secret";
import { createAndSendIntelligenceDigest } from "@/lib/intelligence/digest";
import { createAdminClient } from "@/lib/supabase/admin";
import { intelligenceUsesTurso } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 120;

async function ownerIdFor(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_JOB_SECRET?.trim();
  if (secret && requireBearerSecret(request, secret, "INTELLIGENCE_JOB_SECRET").ok) {
    const ownerId = request.headers.get("x-crashboard-owner-id")?.trim();
    if (!ownerId) throw new Error("Scheduled digest requires x-crashboard-owner-id.");
    return ownerId;
  }
  return (await requireDashboardUser()).id;
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = await ownerIdFor(request);
    if (intelligenceUsesTurso()) {
      return NextResponse.json({
        error: "Morning briefs are sent by the local Codex Intelligence worker after validation.",
        ownerId,
      }, { status: 409 });
    }
    const result = await createAndSendIntelligenceDigest(createAdminClient(), ownerId);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Digest failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Digest failed." },
      { status: 500 },
    );
  }
}
