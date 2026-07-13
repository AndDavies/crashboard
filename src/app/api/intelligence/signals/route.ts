import { NextResponse, type NextRequest } from "next/server";
import { getIntelligenceSignals } from "@/lib/intelligence/signals-v2";
import type {
  IntelligenceSignalKind,
  IntelligenceSignalLens,
  IntelligenceSignalRange,
} from "@/lib/intelligence/signals-v2-types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const compare = params.getAll("compare")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 5);
    const result = await getIntelligenceSignals({
      range: (params.get("range") ?? undefined) as IntelligenceSignalRange | undefined,
      lens: (params.get("lens") ?? undefined) as IntelligenceSignalLens | undefined,
      kind: (params.get("kind") ?? undefined) as IntelligenceSignalKind | "all" | undefined,
      q: params.get("q") ?? undefined,
      compare,
      limit: params.get("limit") ? Number(params.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[intelligence] Signal query failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signal query failed." },
      { status: 500 },
    );
  }
}

