import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { requireBearerSecret } from "@/lib/http/verify-bearer-secret";
import {
  createResearchLead,
  runResearchQueue,
  type IntelligenceResearchSignalKind,
} from "@/lib/intelligence/research";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z
  .object({
    signalId: z.string().min(1).max(300),
    signalKind: z.enum(["topic", "keyword", "organization", "system", "programme"]),
    signalLabel: z.string().min(1).max(300).optional(),
    reason: z.string().max(1_000).optional(),
    queryContext: z.record(z.string(), z.unknown()).optional(),
    runNow: z.boolean().default(false),
  })
  .strict();

async function ownerIdFor(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_JOB_SECRET?.trim();
  if (secret && requireBearerSecret(request, secret, "INTELLIGENCE_JOB_SECRET").ok) {
    const ownerId = request.headers.get("x-crashboard-owner-id")?.trim();
    if (!ownerId) throw new Error("Scheduled research requires x-crashboard-owner-id.");
    return ownerId;
  }
  return (await requireDashboardUser()).id;
}

function rawSignalId(value: string) {
  const separator = value.indexOf(":");
  return separator >= 0 ? value.slice(separator + 1) : value;
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = await ownerIdFor(request);
    const parsed = RequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Choose a signal to research.", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const admin = createAdminClient();
    const stableId = parsed.data.signalId;
    const subjectId = rawSignalId(stableId);
    let label = parsed.data.signalLabel?.trim();
    let context = parsed.data.queryContext ?? {};
    if (!label) {
      const signal = await admin
        .from("intelligence_signal_daily")
        .select("signal_label,metadata")
        .eq("owner_id", ownerId)
        .eq("signal_kind", parsed.data.signalKind)
        .eq("signal_id", subjectId)
        .order("signal_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (signal.error) throw new Error(signal.error.message);
      label = signal.data?.signal_label?.trim();
      if (!Object.keys(context).length && signal.data?.metadata) {
        context = signal.data.metadata as Record<string, unknown>;
      }
    }
    if (!label) {
      return NextResponse.json({ error: "That signal is no longer available." }, { status: 404 });
    }
    const lead = await createResearchLead(admin, {
      ownerId,
      signalKind: parsed.data.signalKind as IntelligenceResearchSignalKind,
      signalId: subjectId,
      signalLabel: label,
      reason: parsed.data.reason,
      queryContext: { ...context, stable_signal_id: stableId },
      triggerType: "manual",
      priority: 90,
    });
    const run = parsed.data.runNow
      ? await runResearchQueue(admin, ownerId, {
          leadId: String(lead.lead.id),
          createAutomatic: false,
          maxLeads: 1,
        })
      : null;
    return NextResponse.json(
      { result: { lead: lead.lead, created: lead.created, queued: true, run } },
      { status: lead.created ? 202 : 200 },
    );
  } catch (error) {
    console.error("[intelligence] Research request failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Research request failed." },
      { status: 500 },
    );
  }
}
