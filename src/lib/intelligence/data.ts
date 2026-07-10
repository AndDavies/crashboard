import "server-only";

import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireDashboardUser } from "@/lib/blog/data";
import { EVENT_TYPE_LABELS } from "@/lib/intelligence/taxonomy";
import { createEmbedding } from "@/lib/intelligence/enrichment";
import type {
  IntelligenceDashboardData,
  IntelligenceEventType,
} from "@/lib/intelligence/types";

function missingSchema(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message?.includes("intelligence_")),
  );
}

function emptyDashboard(status: IntelligenceDashboardData["status"]): IntelligenceDashboardData {
  return {
    status,
    generatedAt: new Date().toISOString(),
    configuration: {
      gmailConnected: false,
      gmailOAuthConfigured: Boolean(
        process.env.GOOGLE_GMAIL_CLIENT_ID && process.env.GOOGLE_GMAIL_CLIENT_SECRET,
      ),
      tokenEncryptionConfigured: Boolean(process.env.INTELLIGENCE_TOKEN_ENCRYPTION_KEY),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
    coverage: {
      documentCount: 0,
      eventCount: 0,
      sourceCount: 0,
      failedCount: 0,
      lastSyncedAt: null,
    },
    trends: [],
    trendSeries: [],
    events: [],
    sourceMix: [],
    eventMix: [],
    recentRuns: [],
    alerts: [],
  };
}

export async function getIntelligenceDashboardData(): Promise<IntelligenceDashboardData> {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const ownerId = user.id;

  const [documents, events, sources, trends, runs, alerts] = await Promise.all([
    admin
      .from("documents")
      .select("id,source_type,published_at", { count: "exact" })
      .eq("owner_id", ownerId)
      .order("published_at", { ascending: false }),
    admin
      .from("intelligence_events")
      .select("id,title,event_type,lifecycle_status,summary,announced_at,amount,currency,geography,defence_relevance,canada_allied_relevance,confidence", { count: "exact" })
      .eq("owner_id", ownerId)
      .order("announced_at", { ascending: false })
      .limit(30),
    admin
      .from("intelligence_sources")
      .select("id,source_type,status,last_synced_at")
      .eq("owner_id", ownerId),
    admin
      .from("intelligence_trend_snapshots")
      .select("trend_key,trend_label,domain,period_start,period_end,event_count,mention_rate,event_rate,momentum,independent_source_count,trend_strength,novelty")
      .eq("owner_id", ownerId)
      .order("period_end", { ascending: false })
      .order("trend_strength", { ascending: false })
      .limit(160),
    admin
      .from("intelligence_runs")
      .select("id,run_type,status,processed_count,failed_count,created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("intelligence_alerts")
      .select("id,severity,title,summary,created_at")
      .eq("owner_id", ownerId)
      .eq("status", "unread")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const errors = [documents.error, events.error, sources.error, trends.error, runs.error, alerts.error];
  if (errors.some(missingSchema)) return emptyDashboard("schema_missing");
  const error = errors.find(Boolean);
  if (error) throw new Error(error.message);

  const eventRows = (events.data ?? []) as Array<Record<string, unknown>>;
  const eventIds = eventRows.map((row) => String(row.id));
  const evidenceCounts = new Map<string, number>();
  if (eventIds.length) {
    const evidence = await admin
      .from("intelligence_event_evidence")
      .select("event_id")
      .eq("owner_id", ownerId)
      .in("event_id", eventIds);
    if (evidence.error) throw new Error(evidence.error.message);
    for (const row of evidence.data ?? []) {
      const id = String(row.event_id);
      evidenceCounts.set(id, (evidenceCounts.get(id) ?? 0) + 1);
    }
  }

  const sourceMixMap = new Map<string, number>();
  for (const row of documents.data ?? []) {
    const key = String(row.source_type);
    sourceMixMap.set(key, (sourceMixMap.get(key) ?? 0) + 1);
  }

  const eventMixMap = new Map<IntelligenceEventType, number>();
  for (const row of eventRows) {
    const key = row.event_type as IntelligenceEventType;
    eventMixMap.set(key, (eventMixMap.get(key) ?? 0) + 1);
  }

  const latestPeriod = String((trends.data ?? [])[0]?.period_end ?? "");
  const latestTrends = (trends.data ?? []).filter(
    (row) => String(row.period_end) === latestPeriod,
  );
  const trendSeriesMap = new Map<string, { eventRate: number; mentionRate: number }>();
  for (const row of trends.data ?? []) {
    if (String(row.domain) !== "event_type") continue;
    const period = String(row.period_end);
    const current = trendSeriesMap.get(period) ?? { eventRate: 0, mentionRate: 0 };
    current.eventRate += Number(row.event_rate ?? 0);
    current.mentionRate += Number(row.mention_rate ?? 0);
    trendSeriesMap.set(period, current);
  }

  const lastSyncedAt = (sources.data ?? [])
    .map((row) => (typeof row.last_synced_at === "string" ? row.last_synced_at : null))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    status: "ready",
    generatedAt: new Date().toISOString(),
    configuration: {
      gmailConnected: (sources.data ?? []).some(
        (source) => source.source_type === "gmail" && source.status === "active",
      ),
      gmailOAuthConfigured: Boolean(
        process.env.GOOGLE_GMAIL_CLIENT_ID && process.env.GOOGLE_GMAIL_CLIENT_SECRET,
      ),
      tokenEncryptionConfigured: Boolean(process.env.INTELLIGENCE_TOKEN_ENCRYPTION_KEY),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    },
    coverage: {
      documentCount: documents.count ?? (documents.data ?? []).length,
      eventCount: events.count ?? eventRows.length,
      sourceCount: (sources.data ?? []).filter((source) => source.status === "active").length,
      failedCount: (runs.data ?? []).reduce((sum, run) => sum + Number(run.failed_count ?? 0), 0),
      lastSyncedAt,
    },
    trends: latestTrends.slice(0, 12).map((row) => ({
      key: String(row.trend_key),
      label: String(row.trend_label),
      domain: String(row.domain),
      strength: Number(row.trend_strength),
      momentum: Number(row.momentum),
      eventCount: Number(row.event_count),
      sourceCount: Number(row.independent_source_count),
      novelty: Boolean(row.novelty),
    })),
    trendSeries: [...trendSeriesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, values]) => ({ period, ...values })),
    events: eventRows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      eventType: row.event_type as IntelligenceEventType,
      lifecycleStatus: String(row.lifecycle_status),
      summary: String(row.summary ?? ""),
      announcedAt: typeof row.announced_at === "string" ? row.announced_at : null,
      amount: typeof row.amount === "number" ? row.amount : row.amount ? Number(row.amount) : null,
      currency: typeof row.currency === "string" ? row.currency : null,
      geography: typeof row.geography === "string" ? row.geography : null,
      defenceRelevance: Boolean(row.defence_relevance),
      canadaAlliedRelevance: Boolean(row.canada_allied_relevance),
      confidence: Number(row.confidence ?? 0),
      evidenceCount: evidenceCounts.get(String(row.id)) ?? 0,
    })),
    sourceMix: [...sourceMixMap.entries()]
      .map(([label, count]) => ({ label: label.replaceAll("_", " "), count }))
      .sort((a, b) => b.count - a.count),
    eventMix: [...eventMixMap.entries()]
      .map(([key, count]) => ({ label: EVENT_TYPE_LABELS[key], count }))
      .sort((a, b) => b.count - a.count),
    recentRuns: (runs.data ?? []).map((row) => ({
      id: String(row.id),
      runType: String(row.run_type),
      status: String(row.status),
      processedCount: Number(row.processed_count),
      failedCount: Number(row.failed_count),
      createdAt: String(row.created_at),
    })),
    alerts: (alerts.data ?? []).map((row) => ({
      id: String(row.id),
      severity: String(row.severity),
      title: String(row.title),
      summary: String(row.summary ?? ""),
      createdAt: String(row.created_at),
    })),
  };
}

export async function getIntelligenceEvent(eventId: string) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const event = await admin
    .from("intelligence_events")
    .select("*")
    .eq("owner_id", user.id)
    .eq("id", eventId)
    .maybeSingle();
  if (event.error) throw new Error(event.error.message);
  if (!event.data) return null;

  const [evidence, entities] = await Promise.all([
    admin
      .from("intelligence_event_evidence")
      .select("evidence_role,evidence_text,document_id,documents(title,original_url,canonical_url,publisher_name,published_at,summary_short)")
      .eq("owner_id", user.id)
      .eq("event_id", eventId),
    admin
      .from("intelligence_event_entities")
      .select("role,entity_id,intelligence_entities(canonical_name,entity_type,country_code,description)")
      .eq("owner_id", user.id)
      .eq("event_id", eventId),
  ]);
  if (evidence.error) throw new Error(evidence.error.message);
  if (entities.error) throw new Error(entities.error.message);
  return { event: event.data, evidence: evidence.data ?? [], entities: entities.data ?? [] };
}

export async function searchIntelligenceDocuments(query: string) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const normalizedQuery = query.replace(/\s+/g, " ").trim().slice(0, 300);
  if (!normalizedQuery) return [];

  const keyword = await admin
    .from("documents")
    .select("id,title,summary_short,source_type,original_url,canonical_url,publisher_name,published_at")
    .eq("owner_id", user.id)
    .textSearch("search_document", normalizedQuery, { type: "websearch", config: "english" })
    .order("published_at", { ascending: false })
    .limit(30);
  if (keyword.error && !missingSchema(keyword.error)) throw new Error(keyword.error.message);

  let semanticRows: Array<Record<string, unknown>> = [];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (apiKey) {
    const embedding = await createEmbedding(normalizedQuery, {
      client: new OpenAI({ apiKey }),
    });
    const semantic = await admin.rpc("match_intelligence_documents", {
      query_owner: user.id,
      query_embedding: `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`,
      match_count: 30,
    });
    if (!semantic.error) semanticRows = (semantic.data ?? []) as Array<Record<string, unknown>>;
    else if (!missingSchema(semantic.error)) throw new Error(semantic.error.message);
  }

  const merged = new Map<string, Record<string, unknown> & { match_types: string[] }>();
  for (const row of keyword.data ?? []) {
    merged.set(String(row.id), { ...row, document_id: row.id, match_types: ["keyword"] });
  }
  for (const row of semanticRows) {
    const id = String(row.document_id);
    const existing = merged.get(id);
    if (existing) {
      existing.match_types.push("semantic");
      existing.similarity = row.similarity;
    } else {
      merged.set(id, { ...row, id, match_types: ["semantic"] });
    }
  }

  return [...merged.values()]
    .sort((a, b) => {
      const aBoth = a.match_types.length > 1 ? 1 : 0;
      const bBoth = b.match_types.length > 1 ? 1 : 0;
      if (aBoth !== bBoth) return bBoth - aBoth;
      return Number(b.similarity ?? 0) - Number(a.similarity ?? 0);
    })
    .slice(0, 50);
}

export async function getDefenceIntelligence() {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const result = await admin
    .from("intelligence_events")
    .select("id,title,event_type,lifecycle_status,summary,announced_at,closes_at,amount,currency,geography,country_code,canada_allied_relevance,confidence,evidence_quality")
    .eq("owner_id", user.id)
    .eq("defence_relevance", true)
    .order("announced_at", { ascending: false })
    .limit(120);
  if (missingSchema(result.error)) return [];
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export async function getIntelligenceOperations() {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const [sources, runs, digests, watchlists] = await Promise.all([
    admin
      .from("intelligence_sources")
      .select("id,name,source_type,status,config,checkpoint,last_synced_at,last_error,created_at")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: true }),
    admin
      .from("intelligence_runs")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("intelligence_digests")
      .select("id,digest_date,status,subject,sent_at,error_message")
      .eq("owner_id", user.id)
      .order("digest_date", { ascending: false })
      .limit(20),
    admin
      .from("intelligence_watchlists")
      .select("id,name,description,rules,enabled,created_at,updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false }),
  ]);
  const error = [sources.error, runs.error, digests.error, watchlists.error].find(Boolean);
  if (error && missingSchema(error)) {
    return { sources: [], runs: [], digests: [], watchlists: [] };
  }
  if (error) throw new Error(error.message);
  return {
    sources: sources.data ?? [],
    runs: runs.data ?? [],
    digests: digests.data ?? [],
    watchlists: watchlists.data ?? [],
  };
}
