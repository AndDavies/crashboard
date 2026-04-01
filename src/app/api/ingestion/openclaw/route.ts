import { requireBearerSecret } from "@/lib/http/verify-bearer-secret";
import {
  ingestOpenclawPhase1,
  type Phase1IngestionError,
} from "@/lib/ingestion/openclaw-phase1";
import { parseOpenclawIngestionBody } from "@/lib/openclaw/ingestion";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonIngestionError(err: Phase1IngestionError) {
  const body: Record<string, unknown> = {
    ok: false,
    code: err.code,
    message: err.message,
  };
  if (err.details) body.details = err.details;
  return NextResponse.json(body, { status: err.httpStatus });
}

export async function POST(request: Request) {
  const auth = requireBearerSecret(
    request,
    process.env.OPENCLAW_INGESTION_SECRET,
    "OPENCLAW_INGESTION_SECRET",
  );
  if (!auth.ok) {
    const code =
      auth.status === 503 ? "configuration" : "validation";
    return NextResponse.json(
      { ok: false, code, message: auth.message },
      { status: auth.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "validation", message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const parsed = parseOpenclawIngestionBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, code: "validation", message: parsed.message },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const result = await ingestOpenclawPhase1(parsed.value, admin);

    if (!result.ok) {
      return jsonIngestionError(result);
    }

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Internal error.";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          ok: false,
          code: "configuration",
          message: "Server is not configured for ingestion (Supabase service role).",
        },
        { status: 503 },
      );
    }
    console.error("[ingestion/openclaw]", message);
    return NextResponse.json(
      { ok: false, code: "internal", message },
      { status: 500 },
    );
  }
}
