import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { INTELLIGENCE_EVENT_TYPES } from "@/lib/intelligence/types";

const RuleSchema = z
  .object({
    terms: z.array(z.string().min(1).max(120)).max(30).default([]),
    eventTypes: z.array(z.enum(INTELLIGENCE_EVENT_TYPES)).max(13).default([]),
    minimumStrength: z.number().min(0).max(100).default(65),
    defenceOnly: z.boolean().default(false),
    canadaAlliedOnly: z.boolean().default(false),
  })
  .strict();

const CreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).default(""),
    rules: RuleSchema,
  })
  .strict();

export async function POST(request: NextRequest) {
  const user = await requireDashboardUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid watchlist.", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await createAdminClient()
    .from("intelligence_watchlists")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      rules: parsed.data.rules,
      enabled: true,
    })
    .select("id")
    .single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await requireDashboardUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing watchlist id." }, { status: 400 });
  const result = await createAdminClient()
    .from("intelligence_watchlists")
    .delete()
    .eq("owner_id", user.id)
    .eq("id", id);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
