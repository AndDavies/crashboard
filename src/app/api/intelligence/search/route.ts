import { NextResponse, type NextRequest } from "next/server";
import { searchIntelligenceV2 } from "@/lib/intelligence/hybrid-search-v2";
import { requireDashboardUser } from "@/lib/blog/data";
import { intelligenceSignalsV2DataStatus } from "@/lib/intelligence/v2-readiness";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTursoIntelligenceStore, intelligenceUsesTurso } from "@/lib/intelligence/store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 30);
    const ownerId = (await requireDashboardUser()).id;
    if (intelligenceUsesTurso()) {
      const results = await getTursoIntelligenceStore().searchDocuments(query, limit);
      return NextResponse.json({
        query,
        catalog: [],
        results: results.map((row) => ({
          id: row.id,
          documentId: row.id,
          title: row.title,
          passage: row.passage,
          publisher: row.publisher,
          sourceFamily: row.sourceFamily,
          publishedAt: row.publishedAt,
          url: row.canonicalUrl,
          whyMatched: row.whyMatched,
          authority: "retained source",
        })),
        ranked: results,
        dataStatus: "ready",
      });
    }
    const dataStatus = await intelligenceSignalsV2DataStatus(createAdminClient(), ownerId);
    if (dataStatus !== "ready" && dataStatus !== "stale") {
      return NextResponse.json({
        query,
        catalog: [],
        results: [],
        ranked: [],
        dataStatus,
      });
    }
    return NextResponse.json(await searchIntelligenceV2(query, { limit }));
  } catch (error) {
    console.error("[intelligence] Hybrid search failed.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}
