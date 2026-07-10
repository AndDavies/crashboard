import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { requireBearerSecret } from "@/lib/http/verify-bearer-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GMAIL_SYNC_TIME_BUDGET_MS,
  GmailSyncInProgressError,
  getGmailSource,
  syncGmailSource,
} from "@/lib/intelligence/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z
  .object({
    mode: z.enum(["backfill", "incremental", "discovery"]).default("incremental"),
    maxMessages: z.number().int().min(1).max(25).default(1),
    windowStart: z.string().optional(),
    windowEnd: z.string().optional(),
    resetCheckpoint: z.boolean().default(false),
  })
  .strict();

async function ownerIdFor(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_JOB_SECRET?.trim();
  if (secret && requireBearerSecret(request, secret, "INTELLIGENCE_JOB_SECRET").ok) {
    const ownerId = request.headers.get("x-crashboard-owner-id")?.trim();
    if (!ownerId) throw new Error("Scheduled sync requires x-crashboard-owner-id.");
    return ownerId;
  }
  const user = await requireDashboardUser();
  return user.id;
}

export async function POST(request: NextRequest) {
  let ownerId: string;
  try {
    ownerId = await ownerIdFor(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication required." },
      { status: 401 },
    );
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sync request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const source = await getGmailSource(admin, ownerId);
    if (!source) {
      return NextResponse.json(
        { error: "Connect Gmail before running newsletter sync." },
        { status: 409 },
      );
    }
    const result = await syncGmailSource(admin, source, {
      ...parsed.data,
      timeBudgetMs: GMAIL_SYNC_TIME_BUDGET_MS,
    });
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[intelligence] Gmail sync failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gmail sync failed." },
      { status: error instanceof GmailSyncInProgressError ? 409 : 500 },
    );
  }
}
