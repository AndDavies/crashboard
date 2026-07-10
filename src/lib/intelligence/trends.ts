import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateTrendMetrics,
  normalizedRate,
} from "@/lib/intelligence/scoring";
import { EVENT_TYPE_LABELS } from "@/lib/intelligence/taxonomy";
import type { IntelligenceEventType } from "@/lib/intelligence/types";

type EventRow = {
  id: string;
  event_type: IntelligenceEventType;
  announced_at: string | null;
  evidence_quality: number;
  confidence: number;
  defence_relevance: boolean;
  canada_allied_relevance: boolean;
  metadata: { themes?: string[] } | null;
};

type EvidenceRow = {
  event_id: string;
  source_independence_key: string | null;
};

type TrendSnapshotReplacement = {
  applied: boolean;
  snapshot_count: number;
  stale_deleted_count: number;
  generation_started_at: string;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function daysBefore(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekKey(value: string) {
  const date = startOfDay(new Date(value));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return isoDate(date);
}

async function replaceTrendSnapshotPeriod(
  admin: SupabaseClient,
  ownerId: string,
  periodStart: string,
  periodEnd: string,
  generationStartedAt: string,
  rows: Array<Record<string, unknown>>,
) {
  const replacement = await admin.rpc("replace_intelligence_trend_snapshots", {
    p_owner_id: ownerId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_generation_started_at: generationStartedAt,
    p_rows: rows,
  });
  if (replacement.error) throw new Error(replacement.error.message);

  const result = replacement.data as TrendSnapshotReplacement | null;
  if (
    !result ||
    typeof result.applied !== "boolean" ||
    !Number.isFinite(Number(result.snapshot_count)) ||
    !Number.isFinite(Number(result.stale_deleted_count))
  ) {
    throw new Error("Trend replacement returned an invalid result.");
  }

  return {
    applied: result.applied,
    snapshotCount: Number(result.snapshot_count),
    staleDeletedCount: Number(result.stale_deleted_count),
    generationStartedAt: result.generation_started_at,
  };
}

export async function refreshTrendSnapshots(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
) {
  const generationStartedAt = new Date().toISOString();
  const periodEnd = startOfDay(anchor);
  const currentStart = daysBefore(periodEnd, 13);
  const baselineStart = daysBefore(currentStart, 42);
  const periodStartDate = isoDate(currentStart);
  const periodEndDate = isoDate(periodEnd);
  const since = baselineStart.toISOString();

  const [eventsResult, documentsResult] = await Promise.all([
    admin
      .from("intelligence_events")
      .select(
        "id,event_type,announced_at,evidence_quality,confidence,defence_relevance,canada_allied_relevance,metadata",
      )
      .eq("owner_id", ownerId)
      .gte("announced_at", since),
    admin
      .from("documents")
      .select("id,published_at")
      .eq("owner_id", ownerId)
      .gte("published_at", since),
  ]);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (documentsResult.error) throw new Error(documentsResult.error.message);

  const events = (eventsResult.data ?? []) as EventRow[];
  const eventIds = events.map((event) => event.id);
  let evidence: EvidenceRow[] = [];
  if (eventIds.length) {
    const result = await admin
      .from("intelligence_event_evidence")
      .select("event_id,source_independence_key")
      .eq("owner_id", ownerId)
      .in("event_id", eventIds);
    if (result.error) throw new Error(result.error.message);
    evidence = (result.data ?? []) as EvidenceRow[];
  }

  const documents = (documentsResult.data ?? []) as Array<{
    id: string;
    published_at: string | null;
  }>;
  const currentDocumentCount = documents.filter(
    (document) =>
      document.published_at && new Date(document.published_at) >= currentStart,
  ).length;
  const baselineDocumentCount = documents.filter((document) => {
    if (!document.published_at) return false;
    const date = new Date(document.published_at);
    return date >= baselineStart && date < currentStart;
  }).length;

  const evidenceByEvent = new Map<string, Set<string>>();
  for (const row of evidence) {
    if (!evidenceByEvent.has(row.event_id))
      evidenceByEvent.set(row.event_id, new Set());
    if (row.source_independence_key) {
      evidenceByEvent.get(row.event_id)?.add(row.source_independence_key);
    }
  }

  const groups = new Map<
    string,
    { label: string; domain: string; events: EventRow[] }
  >();
  for (const event of events) {
    const eventTypeKey = `event:${event.event_type}`;
    if (!groups.has(eventTypeKey)) {
      groups.set(eventTypeKey, {
        label: EVENT_TYPE_LABELS[event.event_type],
        domain: "event_type",
        events: [],
      });
    }
    groups.get(eventTypeKey)?.events.push(event);

    for (const theme of event.metadata?.themes ?? []) {
      const normalized = theme
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (!normalized) continue;
      const key = `theme:${normalized}`;
      if (!groups.has(key))
        groups.set(key, { label: theme, domain: "theme", events: [] });
      groups.get(key)?.events.push(event);
    }
  }

  const rows = [...groups.entries()].flatMap(([trendKey, group]) => {
    const currentEvents = group.events.filter(
      (event) =>
        event.announced_at && new Date(event.announced_at) >= currentStart,
    );
    const baselineEvents = group.events.filter((event) => {
      if (!event.announced_at) return false;
      const date = new Date(event.announced_at);
      return date >= baselineStart && date < currentStart;
    });
    if (!currentEvents.length) return [];

    const currentRate = normalizedRate(
      currentEvents.length,
      currentDocumentCount,
    );
    const baselineRate = normalizedRate(
      baselineEvents.length,
      baselineDocumentCount,
    );
    const sources = new Set(
      currentEvents.flatMap((event) => [
        ...(evidenceByEvent.get(event.id) ?? []),
      ]),
    );
    const activeWeeks = new Set(
      group.events
        .filter((event) => event.announced_at)
        .map((event) => weekKey(event.announced_at!)),
    ).size;
    const confidence =
      currentEvents.reduce(
        (sum, event) =>
          sum + (Number(event.evidence_quality) + Number(event.confidence)) / 2,
        0,
      ) / currentEvents.length;
    const metrics = calculateTrendMetrics({
      currentEventRate: currentRate,
      baselineEventRate: baselineRate,
      independentSourceCount: sources.size,
      activeWeeks,
      evidenceConfidence: confidence,
    });

    return [
      {
        owner_id: ownerId,
        trend_key: trendKey,
        trend_label: group.label,
        domain: group.domain,
        period_start: periodStartDate,
        period_end: periodEndDate,
        document_count: currentDocumentCount,
        cluster_count: new Set(currentEvents.map((event) => event.id)).size,
        event_count: currentEvents.length,
        independent_source_count: sources.size,
        mention_rate: currentRate,
        event_rate: currentRate,
        momentum: metrics.momentum,
        source_diversity: metrics.sourceDiversity,
        persistence: metrics.persistence,
        evidence_confidence: metrics.evidenceConfidence,
        trend_strength: metrics.trendStrength,
        novelty: baselineEvents.length === 0,
        metadata: {
          baseline_event_rate: baselineRate,
          active_weeks: activeWeeks,
        },
        computed_at: generationStartedAt,
      },
    ];
  });

  const replacement = await replaceTrendSnapshotPeriod(
    admin,
    ownerId,
    periodStartDate,
    periodEndDate,
    generationStartedAt,
    rows,
  );

  if (!replacement.applied) {
    return {
      snapshotCount: replacement.snapshotCount,
      periodStart: periodStartDate,
      periodEnd: periodEndDate,
      staleDeletedCount: 0,
      superseded: true,
    };
  }

  for (const row of rows.filter(
    (candidate) => candidate.trend_strength >= 70,
  )) {
    const alert = await admin.from("intelligence_alerts").upsert(
      {
        owner_id: ownerId,
        severity: row.trend_strength >= 85 ? "urgent" : "notable",
        title: `${row.trend_label} is accelerating`,
        summary: `${row.event_count} evidence-backed events across ${row.independent_source_count} independent sources in the current window.`,
        dedupe_key: `${row.trend_key}:${row.period_end}`,
      },
      { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
    );
    if (alert.error) throw new Error(alert.error.message);
  }

  const watchlistsResult = await admin
    .from("intelligence_watchlists")
    .select("id,name,rules")
    .eq("owner_id", ownerId)
    .eq("enabled", true);
  if (watchlistsResult.error) throw new Error(watchlistsResult.error.message);

  for (const watchlist of watchlistsResult.data ?? []) {
    const rules = (watchlist.rules ?? {}) as {
      terms?: string[];
      eventTypes?: string[];
      minimumStrength?: number;
      defenceOnly?: boolean;
      canadaAlliedOnly?: boolean;
    };
    const terms = (rules.terms ?? []).map((term) => term.toLowerCase());
    const minimumStrength = Number(rules.minimumStrength ?? 65);

    for (const row of rows) {
      if (rules.defenceOnly || rules.canadaAlliedOnly) continue;
      const termMatch =
        terms.length === 0 ||
        terms.some((term) => row.trend_label.toLowerCase().includes(term));
      if (!termMatch || row.trend_strength < minimumStrength) continue;
      const alert = await admin.from("intelligence_alerts").upsert(
        {
          owner_id: ownerId,
          watchlist_id: watchlist.id,
          severity: row.trend_strength >= 85 ? "urgent" : "notable",
          title: `${watchlist.name}: ${row.trend_label}`,
          summary: `Trend strength ${Math.round(row.trend_strength)}/100 with ${row.event_count} events across ${row.independent_source_count} sources.`,
          dedupe_key: `watchlist:${watchlist.id}:${row.trend_key}:${row.period_end}`,
        },
        { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
      );
      if (alert.error) throw new Error(alert.error.message);
    }

    const currentEvents = events.filter(
      (event) =>
        event.announced_at && new Date(event.announced_at) >= currentStart,
    );
    for (const event of currentEvents) {
      const eventText =
        `${EVENT_TYPE_LABELS[event.event_type]} ${(event.metadata?.themes ?? []).join(" ")}`.toLowerCase();
      const termMatch =
        terms.length === 0 || terms.some((term) => eventText.includes(term));
      const typeMatch =
        !rules.eventTypes?.length ||
        rules.eventTypes.includes(event.event_type);
      if (
        !termMatch ||
        !typeMatch ||
        (rules.defenceOnly && !event.defence_relevance) ||
        (rules.canadaAlliedOnly && !event.canada_allied_relevance)
      )
        continue;
      const alert = await admin.from("intelligence_alerts").upsert(
        {
          owner_id: ownerId,
          watchlist_id: watchlist.id,
          event_id: event.id,
          severity: "notable",
          title: `${watchlist.name}: new ${EVENT_TYPE_LABELS[event.event_type]}`,
          summary: `A new evidence-backed event matched the saved watchlist rules.`,
          dedupe_key: `watchlist:${watchlist.id}:event:${event.id}`,
        },
        { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
      );
      if (alert.error) throw new Error(alert.error.message);
    }
  }

  return {
    snapshotCount: replacement.snapshotCount,
    periodStart: periodStartDate,
    periodEnd: periodEndDate,
    staleDeletedCount: replacement.staleDeletedCount,
    superseded: false,
  };
}

export const __testables = {
  replaceTrendSnapshotPeriod,
};
