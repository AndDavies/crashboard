import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireDashboardUser } from "@/lib/blog/data";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";

export type TrendExplorerFilters = {
  window?: string;
  channel?: string;
  domain?: string;
  status?: string;
  q?: string;
  compare?: string[];
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowMetadata(row: Record<string, unknown>) {
  return (row.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {}) as Record<string, unknown>;
}

export async function getTrendExplorerData(filters: TrendExplorerFilters) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const windowType = ["pulse", "operating", "strategic"].includes(filters.window ?? "")
    ? filters.window!
    : "operating";
  const channel = filters.channel?.trim() || "all";
  const completeThrough = latestCompleteDateKey();
  const latest = await admin
    .from("intelligence_trend_snapshots")
    .select("period_end")
    .eq("owner_id", user.id)
    .eq("window_type", windowType)
    .eq("channel", channel)
    .lte("period_end", completeThrough)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw new Error(latest.error.message);
  const periodEnd = latest.data?.period_end ? String(latest.data.period_end) : null;

  let query = admin
    .from("intelligence_trend_snapshots")
    .select("*")
    .eq("owner_id", user.id)
    .eq("window_type", windowType)
    .eq("channel", channel)
    .lte("period_end", completeThrough)
    .order("trend_strength", { ascending: false })
    .limit(500);
  if (periodEnd) query = query.eq("period_end", periodEnd);
  if (filters.domain && filters.domain !== "all") query = query.eq("domain", filters.domain);
  if (filters.status && filters.status !== "all") {
    query = query.eq("qualification_status", filters.status);
  }
  if (filters.q?.trim()) query = query.ilike("trend_label", `%${filters.q.trim().slice(0, 80)}%`);
  const rows = await query;
  if (rows.error) throw new Error(rows.error.message);

  const comparisonKeys = [...new Set(filters.compare ?? [])].slice(0, 4);
  const defaultKeys = (rows.data ?? []).slice(0, 4).map((row) => String(row.trend_key));
  const seriesKeys = comparisonKeys.length ? comparisonKeys : defaultKeys;
  const series = seriesKeys.length
    ? await admin
        .from("intelligence_trend_snapshots")
        .select("trend_key,trend_label,period_start,period_end,mention_rate,event_rate,trend_strength,qualification_status")
        .eq("owner_id", user.id)
        .eq("window_type", "weekly")
        .eq("channel", channel)
        .in("trend_key", seriesKeys)
        .lte("period_end", completeThrough)
        .order("period_end", { ascending: true })
    : { data: [], error: null };
  if (series.error) throw new Error(series.error.message);

  const channels = await admin
    .from("intelligence_trend_snapshots")
    .select("channel")
    .eq("owner_id", user.id)
    .eq("window_type", windowType)
    .lte("period_end", completeThrough);
  if (channels.error) throw new Error(channels.error.message);
  return {
    windowType,
    channel,
    periodEnd,
    completeThrough,
    rows: (rows.data ?? []).map((row) => ({ ...row, metadata: rowMetadata(row) })),
    series: series.data ?? [],
    seriesKeys,
    channels: [...new Set((channels.data ?? []).map((row) => String(row.channel)))].sort(),
    domains: [...new Set((rows.data ?? []).map((row) => String(row.domain)))].sort(),
    analyticsComputedAt: (rows.data ?? []).map((row) => String(row.computed_at ?? "")).sort().at(-1) ?? null,
  };
}

async function evidenceDocumentIds(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  trendKey: string,
) {
  const [kind, rawId] = trendKey.split(":", 2);
  if (!kind || !rawId) return { documentIds: [] as string[], eventIds: [] as string[] };
  if (kind === "concept") {
    const [documents, events] = await Promise.all([
      admin
        .from("intelligence_document_concepts")
        .select("document_id")
        .eq("owner_id", ownerId)
        .eq("concept_id", rawId),
      admin
        .from("intelligence_event_concepts")
        .select("event_id")
        .eq("owner_id", ownerId)
        .eq("concept_id", rawId),
    ]);
    if (documents.error) throw new Error(documents.error.message);
    if (events.error) throw new Error(events.error.message);
    return {
      documentIds: [...new Set((documents.data ?? []).map((row) => String(row.document_id)))],
      eventIds: [...new Set((events.data ?? []).map((row) => String(row.event_id)))],
    };
  }
  if (kind === "entity") {
    const [documents, events] = await Promise.all([
      admin.from("intelligence_document_entities").select("document_id").eq("owner_id", ownerId).eq("entity_id", rawId),
      admin.from("intelligence_event_entities").select("event_id").eq("owner_id", ownerId).eq("entity_id", rawId),
    ]);
    if (documents.error) throw new Error(documents.error.message);
    if (events.error) throw new Error(events.error.message);
    return {
      documentIds: [...new Set((documents.data ?? []).map((row) => String(row.document_id)))],
      eventIds: [...new Set((events.data ?? []).map((row) => String(row.event_id)))],
    };
  }
  if (kind === "event") {
    const events = await admin
      .from("intelligence_events")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("event_type", rawId);
    if (events.error) throw new Error(events.error.message);
    return { documentIds: [], eventIds: (events.data ?? []).map((row) => String(row.id)) };
  }
  if (kind === "procurement-stage") {
    const links = await admin
      .from("intelligence_procurement_case_events")
      .select("event_id")
      .eq("owner_id", ownerId)
      .eq("stage", rawId);
    if (links.error) throw new Error(links.error.message);
    return { documentIds: [], eventIds: (links.data ?? []).map((row) => String(row.event_id)) };
  }
  return { documentIds: [], eventIds: [] };
}

export async function getTrendDetail(trendKey: string) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const completeThrough = latestCompleteDateKey();
  const history = await admin
    .from("intelligence_trend_snapshots")
    .select("*")
    .eq("owner_id", user.id)
    .eq("trend_key", trendKey)
    .eq("channel", "all")
    .lte("period_end", completeThrough)
    .order("period_end", { ascending: true });
  if (history.error) throw new Error(history.error.message);
  if (!history.data?.length) return null;
  const operating = history.data
    .filter((row) => row.window_type === "operating")
    .sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)))
    .at(-1) ?? history.data.at(-1)!;
  const supports = await evidenceDocumentIds(admin, user.id, trendKey);
  let eventIds = supports.eventIds;
  if (eventIds.length) {
    const evidence = await admin
      .from("intelligence_event_evidence")
      .select("document_id")
      .eq("owner_id", user.id)
      .in("event_id", eventIds);
    if (evidence.error) throw new Error(evidence.error.message);
    supports.documentIds.push(...(evidence.data ?? []).map((row) => String(row.document_id)));
  }
  const documentIds = [...new Set(supports.documentIds)];
  const documents = documentIds.length
    ? await admin
        .from("documents")
        .select("id,title,summary_short,publisher_name,published_at,source_type,canonical_url,original_url,source_identity_id")
        .eq("owner_id", user.id)
        .in("id", documentIds.slice(0, 1000))
        .order("published_at", { ascending: false })
        .limit(200)
    : { data: [], error: null };
  if (documents.error) throw new Error(documents.error.message);
  const events = eventIds.length
    ? await admin
        .from("intelligence_events")
        .select("id,title,event_type,lifecycle_status,summary,announced_at,confidence")
        .eq("owner_id", user.id)
        .in("id", eventIds.slice(0, 1000))
        .order("announced_at", { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (events.error) throw new Error(events.error.message);
  eventIds = (events.data ?? []).map((row) => String(row.id));

  const sourceIdentityIds = [...new Set((documents.data ?? []).map((row) => row.source_identity_id).filter(Boolean))] as string[];
  const sourceIdentities = sourceIdentityIds.length
    ? await admin
        .from("intelligence_source_identities")
        .select("id,source_family,canonical_name")
        .eq("owner_id", user.id)
        .in("id", sourceIdentityIds)
    : { data: [], error: null };
  if (sourceIdentities.error) throw new Error(sourceIdentities.error.message);
  const sourceById = new Map((sourceIdentities.data ?? []).map((row) => [String(row.id), String(row.source_family ?? row.canonical_name)]));
  const sourceMix = new Map<string, number>();
  for (const document of documents.data ?? []) {
    const source = sourceById.get(String(document.source_identity_id)) ?? String(document.publisher_name ?? "Unknown source");
    sourceMix.set(source, (sourceMix.get(source) ?? 0) + 1);
  }

  const [kind, subjectId] = trendKey.split(":", 2);
  const cooccurrence = kind === "concept"
    ? await admin
        .from("intelligence_cooccurrence_snapshots")
        .select("*")
        .eq("owner_id", user.id)
        .eq("qualified", true)
        .or(`subject_a_id.eq.${subjectId},subject_b_id.eq.${subjectId}`)
        .order("support_count", { ascending: false })
        .limit(20)
    : { data: [], error: null };
  if (cooccurrence.error) throw new Error(cooccurrence.error.message);
  const relatedConceptIds = [...new Set((cooccurrence.data ?? []).flatMap((row) => [String(row.subject_a_id), String(row.subject_b_id)]))];
  const relatedConcepts = relatedConceptIds.length
    ? await admin.from("intelligence_concepts").select("id,canonical_label").eq("owner_id", user.id).in("id", relatedConceptIds)
    : { data: [], error: null };
  if (relatedConcepts.error) throw new Error(relatedConcepts.error.message);
  const relatedLabelById = new Map((relatedConcepts.data ?? []).map((row) => [String(row.id), String(row.canonical_label)]));
  const related = (cooccurrence.data ?? []).map((row) => {
    const relatedId = String(row.subject_a_id) === subjectId ? String(row.subject_b_id) : String(row.subject_a_id);
    return { ...row, related_label: relatedLabelById.get(relatedId) ?? "Related concept" };
  });

  const cases = eventIds.length
    ? await admin
        .from("intelligence_procurement_case_events")
        .select("stage,transition_at,intelligence_procurement_cases(id,title,current_stage,status,confidence)")
        .eq("owner_id", user.id)
        .in("event_id", eventIds)
        .order("transition_at", { ascending: true })
    : { data: [], error: null };
  if (cases.error) throw new Error(cases.error.message);
  return {
    current: { ...operating, metadata: rowMetadata(operating) },
    history: history.data.map((row) => ({ ...row, metadata: rowMetadata(row) })),
    documents: documents.data ?? [],
    events: events.data ?? [],
    sourceMix: [...sourceMix.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    related,
    cases: cases.data ?? [],
    completeThrough,
  };
}

export async function getIntelligenceDocument(documentId: string) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const document = await admin.from("documents").select("*").eq("owner_id", user.id).eq("id", documentId).maybeSingle();
  if (document.error) throw new Error(document.error.message);
  if (!document.data) return null;
  const [segments, concepts, entities, evidence] = await Promise.all([
    admin.from("intelligence_document_segments").select("*").eq("owner_id", user.id).eq("document_id", documentId).order("segment_index"),
    admin.from("intelligence_document_concepts").select("scope,mention_count,confidence,evidence_text,intelligence_concepts(id,canonical_label,concept_type,domain,subdomain)").eq("owner_id", user.id).eq("document_id", documentId),
    admin.from("intelligence_document_entities").select("role,confidence,evidence_text,intelligence_entities(id,canonical_name,entity_type)").eq("owner_id", user.id).eq("document_id", documentId),
    admin.from("intelligence_event_evidence").select("evidence_role,evidence_text,intelligence_events(id,title,event_type,lifecycle_status,announced_at)").eq("owner_id", user.id).eq("document_id", documentId),
  ]);
  const error = [segments.error, concepts.error, entities.error, evidence.error].find(Boolean);
  if (error) throw new Error(error.message);
  return { document: document.data, segments: segments.data ?? [], concepts: concepts.data ?? [], entities: entities.data ?? [], evidence: evidence.data ?? [] };
}

export const __testables = { number, rowMetadata };
