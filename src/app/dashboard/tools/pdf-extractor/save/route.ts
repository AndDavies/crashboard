import { NextResponse, type NextRequest } from "next/server";
import { requireDashboardUser } from "@/lib/blog/data";
import { saveExtractionCompanion } from "@/lib/pdf-extractor";
import type { PdfExtractionResult } from "@/lib/pdf-extractor/types";
import { isExtractionResult } from "@/lib/pdf-extractor/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireDashboardUser();
  } catch {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = (body as { result?: unknown })?.result;
  if (!isExtractionResult(result)) {
    return NextResponse.json(
      { error: "Invalid extraction result payload." },
      { status: 400 },
    );
  }

  try {
    const saved = await saveExtractionCompanion(result as PdfExtractionResult);
    return NextResponse.json({ saved });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save extraction.",
      },
      { status: 500 },
    );
  }
}
