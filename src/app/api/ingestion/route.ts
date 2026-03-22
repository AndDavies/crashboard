import {
  parseIngestionRequest,
  runIngestion,
} from "@/lib/ingestion";
import type {
  IngestionServiceError,
  IngestionServiceResult,
} from "@/lib/ingestion/types";
import { verifyOptionalBearerSecret } from "@/lib/http/verify-bearer-secret";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function jsonSuccess(payload: IngestionServiceResult) {
  return NextResponse.json(payload, { status: 200 });
}

function jsonError(err: IngestionServiceError) {
  const body: Record<string, unknown> = {
    ok: false,
    code: err.code,
    message: err.message,
  };
  if (err.details) body.details = err.details;
  return NextResponse.json(body, { status: err.httpStatus });
}

export async function POST(request: Request) {
  if (
    !verifyOptionalBearerSecret(request, process.env.INGESTION_API_SECRET)
  ) {
    return NextResponse.json(
      { ok: false, code: "validation", message: "Unauthorized." },
      { status: 401 },
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

  const parsed = parseIngestionRequest(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, code: "validation", message: parsed.message },
      { status: 400 },
    );
  }

  const result = await runIngestion(parsed.value);
  if (!result.ok) {
    return jsonError(result);
  }
  return jsonSuccess(result);
}
