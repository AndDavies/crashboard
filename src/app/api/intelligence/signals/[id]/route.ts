import { NextResponse, type NextRequest } from "next/server";
import { getIntelligenceSignal } from "@/lib/intelligence/signals-v2";
import type { IntelligenceSignalRange } from "@/lib/intelligence/signals-v2-types";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const signal = await getIntelligenceSignal(decodeURIComponent(id), {
      range: (request.nextUrl.searchParams.get("range") ?? undefined) as
        IntelligenceSignalRange | undefined,
    });
    if (!signal) return NextResponse.json({ error: "Signal not found." }, { status: 404 });
    return NextResponse.json({ signal });
  } catch (error) {
    console.error("[intelligence] Signal detail query failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signal query failed." },
      { status: 500 },
    );
  }
}
