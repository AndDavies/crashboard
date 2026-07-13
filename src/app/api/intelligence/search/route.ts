import { NextResponse, type NextRequest } from "next/server";
import { searchIntelligenceV2 } from "@/lib/intelligence/hybrid-search-v2";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
    return NextResponse.json(await searchIntelligenceV2(query, { limit }));
  } catch (error) {
    console.error("[intelligence] Hybrid search failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}

