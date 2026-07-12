import type { IntelligenceConceptType, IntelligenceEventType } from "@/lib/intelligence/types";

export type TrendingDocumentRow = {
  id: string;
  title: string | null;
  summary_short: string | null;
  published_at: string | null;
  source_identity_id: string | null;
  publisher_name: string | null;
  concepts: Array<{ concept_id: string; confidence: number }>;
};

export type TrendingConceptRow = {
  id: string;
  canonical_label: string;
  concept_type: IntelligenceConceptType;
};

export type TrendingEventRow = {
  id: string;
  title: string;
  event_type: IntelligenceEventType;
  announced_at: string | null;
  concepts: Array<{ concept_id: string; confidence: number }>;
};

export type TrendDirection = "emerging" | "rising" | "steady" | "cooling";

export type TrendingTopic = {
  key: string;
  conceptIds: string[];
  label: string;
  conceptType: IntelligenceConceptType;
  direction: TrendDirection;
  currentDocuments: number;
  previousDocuments: number;
  currentShare: number;
  previousShare: number;
  changePoints: number;
  sourceCount: number;
  weekly: Array<{ period: string; share: number; documents: number; total: number }>;
  eventMix: Array<{ eventType: IntelligenceEventType; count: number }>;
  evidence: Array<{
    id: string;
    title: string;
    summary: string | null;
    publishedAt: string;
  }>;
  why: string;
  soWhat: string;
};

export type TrendingAnalysis = {
  completeThrough: string;
  analysisStart: string;
  currentStart: string;
  previousStart: string;
  currentDocumentCount: number;
  previousDocumentCount: number;
  currentSourceCount: number;
  topics: TrendingTopic[];
  rising: TrendingTopic[];
  emerging: TrendingTopic[];
  steady: TrendingTopic[];
  cooling: TrendingTopic[];
};

const DAY_MS = 86_400_000;
const TYPE_PRIORITY: Record<IntelligenceConceptType, number> = {
  theme: 4,
  capability: 3,
  phrase: 2,
  keyword: 1,
};

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  return dateKey(new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS));
}

function normalizeLabel(value: string) {
  return value.trim().toLocaleLowerCase("en-CA").replace(/[^a-z0-9]+/g, " ").trim();
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function eventLabel(value: IntelligenceEventType) {
  const labels: Record<IntelligenceEventType, string> = {
    procurement_notice: "procurement notices",
    rfi_rfp_challenge: "RFIs, RFPs, and challenges",
    award: "contract awards",
    funding_investment: "funding announcements",
    partnership: "partnership announcements",
    acquisition: "acquisitions",
    development: "development announcements",
    trial_pilot: "trials and pilots",
    deployment: "deployments",
    policy_regulation: "policy and regulatory announcements",
    capacity_expansion: "capacity expansions",
    cancellation: "cancellations",
    other: "other announcements",
  };
  return labels[value];
}

function directionFor(current: number, previous: number, change: number): TrendDirection {
  if (previous <= 1 && current >= 5 && change >= 0.7) return "emerging";
  if (change >= 0.7) return "rising";
  if (change <= -0.7) return "cooling";
  return "steady";
}

function buildWhy(
  currentDocuments: number,
  previousDocuments: number,
  sourceCount: number,
  direction: TrendDirection,
  eventMix: TrendingTopic["eventMix"],
) {
  const movement = direction === "cooling"
    ? `Coverage fell from ${previousDocuments} to ${currentDocuments} articles.`
    : `Coverage grew from ${previousDocuments} to ${currentDocuments} articles across ${sourceCount} independent sources.`;
  const driver = eventMix.find((item) => item.eventType !== "other");
  return driver
    ? `${movement} Recent evidence includes ${driver.count} ${eventLabel(driver.eventType)}.`
    : `${movement} The increase is broad enough to appear across multiple publications, rather than one newsletter.`;
}

function buildSoWhat(
  label: string,
  conceptType: IntelligenceConceptType,
  eventMix: TrendingTopic["eventMix"],
  direction: TrendDirection,
) {
  if (direction === "cooling") {
    return `Attention to ${label} is easing. Treat it as a watch item unless fresh announcements reverse the decline.`;
  }
  const eventType = eventMix.find((item) => item.eventType !== "other")?.eventType;
  if (eventType === "award" || eventType === "procurement_notice" || eventType === "deployment") {
    return `The conversation is moving into spending and execution. Watch who is buying, contract values, and delivery timing.`;
  }
  if (eventType === "trial_pilot" || eventType === "development") {
    return `The capability appears to be maturing. The next useful signals are successful trials, named buyers, and operational deployment.`;
  }
  if (eventType === "funding_investment" || eventType === "capacity_expansion") {
    return `Capital and capacity are forming around ${label}. Watch whether investment converts into production, customers, or procurement.`;
  }
  if (eventType === "policy_regulation") {
    return `Policy is shaping attention to ${label}. Watch for implementation dates, affected buyers, and compliance requirements.`;
  }
  if (conceptType === "capability") {
    return `${label} is gaining agenda share across the market. Watch for trials, procurement, and named operational users to confirm adoption.`;
  }
  return `${label} is taking a larger share of industry attention. Watch for concrete funding, procurement, or deployment evidence that confirms lasting momentum.`;
}

export function analyzeTrendingTopics(input: {
  completeThrough: string;
  documents: TrendingDocumentRow[];
  concepts: TrendingConceptRow[];
  events: TrendingEventRow[];
}): TrendingAnalysis {
  const currentStart = addDays(input.completeThrough, -27);
  const previousStart = addDays(currentStart, -28);
  const analysisStart = addDays(input.completeThrough, -83);
  const currentDocuments = input.documents.filter((row) => {
    const day = row.published_at?.slice(0, 10) ?? "";
    return day >= currentStart && day <= input.completeThrough;
  });
  const previousDocuments = input.documents.filter((row) => {
    const day = row.published_at?.slice(0, 10) ?? "";
    return day >= previousStart && day < currentStart;
  });
  const currentIds = new Set(currentDocuments.map((row) => row.id));
  const previousIds = new Set(previousDocuments.map((row) => row.id));
  const conceptById = new Map(input.concepts.map((row) => [row.id, row]));
  const labelGroups = new Map<string, { label: string; type: IntelligenceConceptType; conceptIds: Set<string> }>();

  for (const concept of input.concepts) {
    const key = normalizeLabel(concept.canonical_label);
    if (!key) continue;
    const group = labelGroups.get(key);
    if (!group) {
      labelGroups.set(key, {
        label: concept.canonical_label,
        type: concept.concept_type,
        conceptIds: new Set([concept.id]),
      });
    } else {
      group.conceptIds.add(concept.id);
      if (TYPE_PRIORITY[concept.concept_type] > TYPE_PRIORITY[group.type]) {
        group.type = concept.concept_type;
        group.label = concept.canonical_label;
      }
    }
  }

  const groupByConceptId = new Map<string, string>();
  for (const [key, group] of labelGroups) {
    for (const conceptId of group.conceptIds) groupByConceptId.set(conceptId, key);
  }

  const topicDocuments = new Map<string, Set<string>>();
  const topicSources = new Map<string, Set<string>>();
  for (const document of input.documents) {
    const seen = new Set<string>();
    for (const association of document.concepts) {
      if (association.confidence < 0.65 || !conceptById.has(association.concept_id)) continue;
      const key = groupByConceptId.get(association.concept_id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const ids = topicDocuments.get(key) ?? new Set<string>();
      ids.add(document.id);
      topicDocuments.set(key, ids);
      if (currentIds.has(document.id)) {
        const sources = topicSources.get(key) ?? new Set<string>();
        sources.add(document.source_identity_id ?? document.publisher_name ?? `document:${document.id}`);
        topicSources.set(key, sources);
      }
    }
  }

  const eventCounts = new Map<string, Map<IntelligenceEventType, number>>();
  for (const event of input.events) {
    if (!event.announced_at || event.announced_at.slice(0, 10) < currentStart) continue;
    const seen = new Set<string>();
    for (const association of event.concepts) {
      if (association.confidence < 0.65) continue;
      const key = groupByConceptId.get(association.concept_id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const counts = eventCounts.get(key) ?? new Map<IntelligenceEventType, number>();
      counts.set(event.event_type, (counts.get(event.event_type) ?? 0) + 1);
      eventCounts.set(key, counts);
    }
  }

  const weeklyTotals = Array.from({ length: 12 }, (_, index) => {
    const start = addDays(analysisStart, index * 7);
    const end = addDays(start, 6);
    const total = input.documents.filter((row) => {
      const day = row.published_at?.slice(0, 10) ?? "";
      return day >= start && day <= end;
    }).length;
    return { start, end, total };
  });

  const topics: TrendingTopic[] = [];
  for (const [key, group] of labelGroups) {
    const documentIds = topicDocuments.get(key) ?? new Set<string>();
    const currentCount = [...documentIds].filter((id) => currentIds.has(id)).length;
    const previousCount = [...documentIds].filter((id) => previousIds.has(id)).length;
    const sourceCount = topicSources.get(key)?.size ?? 0;
    if (currentCount < 3 || sourceCount < 2) continue;
    const currentShare = round(100 * currentCount / Math.max(1, currentDocuments.length));
    const previousShare = round(100 * previousCount / Math.max(1, previousDocuments.length));
    const changePoints = round(currentShare - previousShare);
    const direction = directionFor(currentCount, previousCount, changePoints);
    const eventMix = [...(eventCounts.get(key)?.entries() ?? [])]
      .map(([eventType, count]) => ({ eventType, count }))
      .sort((a, b) => b.count - a.count);
    const weekly = weeklyTotals.map((period) => {
      const documents = input.documents.filter((row) => {
        const day = row.published_at?.slice(0, 10) ?? "";
        return documentIds.has(row.id) && day >= period.start && day <= period.end;
      }).length;
      return {
        period: period.start,
        documents,
        total: period.total,
        share: round(100 * documents / Math.max(1, period.total)),
      };
    });
    const evidence = currentDocuments
      .filter((row) => documentIds.has(row.id) && row.published_at && row.title)
      .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
      .slice(0, 3)
      .map((row) => ({
        id: row.id,
        title: row.title!,
        summary: row.summary_short,
        publishedAt: row.published_at!,
      }));
    topics.push({
      key,
      conceptIds: [...group.conceptIds],
      label: group.label,
      conceptType: group.type,
      direction,
      currentDocuments: currentCount,
      previousDocuments: previousCount,
      currentShare,
      previousShare,
      changePoints,
      sourceCount,
      weekly,
      eventMix,
      evidence,
      why: buildWhy(currentCount, previousCount, sourceCount, direction, eventMix),
      soWhat: buildSoWhat(group.label, group.type, eventMix, direction),
    });
  }

  topics.sort((a, b) => b.changePoints - a.changePoints || b.currentDocuments - a.currentDocuments);
  return {
    completeThrough: input.completeThrough,
    analysisStart,
    currentStart,
    previousStart,
    currentDocumentCount: currentDocuments.length,
    previousDocumentCount: previousDocuments.length,
    currentSourceCount: new Set(currentDocuments.map((row) => row.source_identity_id ?? row.publisher_name ?? row.id)).size,
    topics,
    rising: topics.filter((topic) => topic.direction === "rising"),
    emerging: topics.filter((topic) => topic.direction === "emerging"),
    steady: topics.filter((topic) => topic.direction === "steady")
      .sort((a, b) => b.currentShare - a.currentShare),
    cooling: topics.filter((topic) => topic.direction === "cooling")
      .sort((a, b) => a.changePoints - b.changePoints),
  };
}
