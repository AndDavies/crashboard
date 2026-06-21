import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import {
  coercePromptPreset,
  isMissingPromptMetricsRelation,
  PromptPresetCreateSchema,
  toPromptPresetInsert,
} from "@/lib/prompt-builder/metrics";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requireUserResponse() {
  try {
    return { user: await requireDashboardUser(), response: null };
  } catch {
    return {
      user: null,
      response: NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      ),
    };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUserResponse();
  if (!auth.user) {
    return auth.response ?? NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const workflowId = request.nextUrl.searchParams.get("workflowId")?.trim();
  const supabase = await createClient();
  let query = supabase
    .from("media_prompt_presets")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (workflowId) query = query.eq("workflow_id", workflowId);

  const { data, error } = await query;
  if (isMissingPromptMetricsRelation(error)) {
    return NextResponse.json({ available: false, presets: [] });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    available: true,
    presets: ((data ?? []) as Array<Record<string, unknown>>).map(
      coercePromptPreset,
    ),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserResponse();
  if (!auth.user) {
    return auth.response ?? NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PromptPresetCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid prompt preset.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_prompt_presets")
    .insert(toPromptPresetInsert(parsed.data, auth.user.id))
    .select("*")
    .single();

  if (isMissingPromptMetricsRelation(error)) {
    return NextResponse.json(
      { error: "Prompt preset tables are not installed yet." },
      { status: 503 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    preset: coercePromptPreset(data as Record<string, unknown>),
  });
}
