import "server-only";

import { requireDashboardUser } from "@/lib/blog/data";
import { analyzeTrendingTopics, type TrendingAnalysis } from "@/lib/intelligence/trending-analysis";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 500;

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await query(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < PAGE_SIZE) return rows;
  }
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function getTrendingAnalysis(): Promise<TrendingAnalysis> {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const completeThrough = latestCompleteDateKey();
  const analysisStart = addDays(completeThrough, -83);
  const currentStart = addDays(completeThrough, -27);

  const [documents, concepts, events] = await Promise.all([
    fetchPages<Record<string, unknown>>((from, to) =>
      admin
        .from("documents")
        .select("id,title,summary_short,published_at,source_identity_id,publisher_name,intelligence_document_concepts(concept_id,confidence)")
        .eq("owner_id", user.id)
        .not("analytics_ready_at", "is", null)
        .gte("published_at", `${analysisStart}T00:00:00.000Z`)
        .lte("published_at", `${completeThrough}T23:59:59.999Z`)
        .order("published_at", { ascending: true })
        .range(from, to),
    ),
    fetchPages<Record<string, unknown>>((from, to) =>
      admin
        .from("intelligence_concepts")
        .select("id,canonical_label,concept_type")
        .eq("owner_id", user.id)
        .eq("status", "active")
        .range(from, to),
    ),
    fetchPages<Record<string, unknown>>((from, to) =>
      admin
        .from("intelligence_events")
        .select("id,title,event_type,announced_at,intelligence_event_concepts(concept_id,confidence)")
        .eq("owner_id", user.id)
        .gte("announced_at", `${currentStart}T00:00:00.000Z`)
        .lte("announced_at", `${completeThrough}T23:59:59.999Z`)
        .order("announced_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  return analyzeTrendingTopics({
    completeThrough,
    documents: documents.map((row) => ({
      id: String(row.id),
      title: typeof row.title === "string" ? row.title : null,
      summary_short: typeof row.summary_short === "string" ? row.summary_short : null,
      published_at: typeof row.published_at === "string" ? row.published_at : null,
      source_identity_id: typeof row.source_identity_id === "string" ? row.source_identity_id : null,
      publisher_name: typeof row.publisher_name === "string" ? row.publisher_name : null,
      concepts: ((row.intelligence_document_concepts ?? []) as Array<Record<string, unknown>>)
        .map((association) => ({
          concept_id: String(association.concept_id),
          confidence: Number(association.confidence ?? 0),
        })),
    })),
    concepts: concepts.map((row) => ({
      id: String(row.id),
      canonical_label: String(row.canonical_label),
      concept_type: row.concept_type as "keyword" | "phrase" | "theme" | "capability",
    })),
    events: events.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      event_type: row.event_type as never,
      announced_at: typeof row.announced_at === "string" ? row.announced_at : null,
      concepts: ((row.intelligence_event_concepts ?? []) as Array<Record<string, unknown>>)
        .map((association) => ({
          concept_id: String(association.concept_id),
          confidence: Number(association.confidence ?? 0),
        })),
    })),
  });
}
