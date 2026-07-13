import type {
  TrendingAnalysis,
  TrendingTopic,
} from "@/lib/intelligence/trending-analysis";
import type { IntelligenceSignalSummary } from "@/lib/intelligence/signals-v2-types";

export type TrendSignalKind =
  | "topic"
  | "keyword"
  | "organization"
  | "system"
  | "programme";

export type TrendDirection = "new" | "rising" | "sustained" | "cooling";
export type EvidenceStrength = "Strong" | "Moderate" | "Early";

export type TrendSeriesPoint = {
  date: string;
  reach: number;
  change: number;
  items: number;
  stories: number;
  sources: number;
  actions: number;
};

export type TrendEvidence = {
  id: string;
  title: string;
  date: string;
  source: string;
  href: string;
  passage?: string | null;
  matchReason?: string;
};

export type TrendAnnotation = {
  date: string;
  type: string;
  label: string;
};

export type TrendSignal = {
  id: string;
  label: string;
  kind: TrendSignalKind;
  direction: TrendDirection;
  evidenceStrength: EvidenceStrength;
  currentReach: number;
  previousReach: number;
  items: number;
  stories: number;
  sources: number;
  actions: number;
  whyNow: string;
  whyItMatters: string;
  whatToWatch: string;
  series: TrendSeriesPoint[];
  evidence: TrendEvidence[];
  annotations: TrendAnnotation[];
};

export const KIND_LABELS: Record<TrendSignalKind, string> = {
  topic: "Topic",
  keyword: "Keyword",
  organization: "Organization",
  system: "System",
  programme: "Programme",
};

export const DIRECTION_LABELS: Record<TrendDirection, string> = {
  new: "New this week",
  rising: "Building momentum",
  sustained: "Sustained attention",
  cooling: "Cooling",
};

function signalKind(topic: TrendingTopic): TrendSignalKind {
  if (topic.conceptType === "capability") return "system";
  if (topic.conceptType === "keyword" || topic.conceptType === "phrase") return "keyword";
  return "topic";
}

function signalDirection(topic: TrendingTopic): TrendDirection {
  if (topic.direction === "emerging") return "new";
  if (topic.direction === "rising") return "rising";
  if (topic.direction === "cooling") return "cooling";
  return "sustained";
}

function evidenceStrength(topic: TrendingTopic): EvidenceStrength {
  if (topic.currentDocuments >= 5 && topic.sourceCount >= 3) return "Strong";
  if (topic.currentDocuments >= 3 && topic.sourceCount >= 2) return "Moderate";
  return "Early";
}

function watchPrompt(topic: TrendingTopic) {
  const action = topic.eventMix.find((event) => event.eventType !== "other")?.eventType;
  if (action === "award") return "Watch delivery dates, contract scope, and follow-on awards.";
  if (action === "procurement_notice" || action === "rfi_rfp_challenge") {
    return "Watch the buyer, deadline, named requirements, and eventual award.";
  }
  if (action === "trial_pilot" || action === "development") {
    return "Watch for test results, named operational users, and a move into procurement.";
  }
  if (action === "deployment") return "Watch adoption by additional users and operational results.";
  if (action === "funding_investment" || action === "capacity_expansion") {
    return "Watch whether announced capital becomes production capacity and customer orders.";
  }
  if (action === "policy_regulation") {
    return "Watch implementation dates, affected buyers, and the first spending decisions.";
  }
  return "Watch for a primary-source announcement, a named buyer, funding, testing, or deployment.";
}

export function toTrendSignals(data: TrendingAnalysis): TrendSignal[] {
  return data.topics.map((topic) => {
    const actions = topic.eventMix
      .filter((event) => event.eventType !== "other")
      .reduce((sum, event) => sum + event.count, 0);
    const series = topic.weekly.map((point, index, points) => ({
      date: point.period,
      reach: point.share,
      change: index ? point.share - points[index - 1]!.share : 0,
      items: point.documents,
      stories: point.documents,
      sources: Math.min(topic.sourceCount, point.documents),
      actions: index === points.length - 1 ? actions : 0,
    }));

    return {
      id: topic.key,
      label: topic.label,
      kind: signalKind(topic),
      direction: signalDirection(topic),
      evidenceStrength: evidenceStrength(topic),
      currentReach: topic.currentShare,
      previousReach: topic.previousShare,
      items: topic.currentDocuments,
      stories: topic.currentDocuments,
      sources: topic.sourceCount,
      actions,
      whyNow: topic.why,
      whyItMatters: topic.soWhat,
      whatToWatch: watchPrompt(topic),
      series,
      evidence: topic.evidence.map((item) => ({
        id: item.id,
        title: item.title,
        date: item.publishedAt,
        source: "Retained source",
        href: `/dashboard/intelligence/documents/${item.id}`,
        passage: item.summary,
        matchReason: `Supports the movement in ${topic.label}.`,
      })),
      // The legacy fallback has aggregate action counts but no trustworthy event date.
      // V2 supplies dated annotations; do not invent a point in fallback mode.
      annotations: [],
    };
  });
}

export function v2SignalToUi(signal: IntelligenceSignalSummary): TrendSignal {
  return {
    id: signal.key || signal.id,
    label: signal.label,
    kind: signal.kind,
    direction: signal.direction,
    evidenceStrength: signal.evidenceStrength === "strong"
      ? "Strong"
      : signal.evidenceStrength === "moderate"
        ? "Moderate"
        : "Early",
    currentReach: signal.currentReach,
    previousReach: signal.previousReach,
    items: signal.currentItems,
    stories: signal.stories,
    sources: signal.sources,
    actions: signal.actions,
    whyNow: signal.whyNow,
    whyItMatters: signal.whyItMatters,
    whatToWatch: signal.whatToWatch,
    series: signal.series.map((point, index, points) => ({
      date: point.date,
      reach: point.shareOfCoverage,
      change: index ? point.shareOfCoverage - points[index - 1]!.shareOfCoverage : 0,
      items: point.items,
      stories: point.stories,
      sources: point.sources,
      actions: point.actions,
    })),
    evidence: signal.evidence.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.publishedAt ?? signal.series.at(-1)?.date ?? "",
      source: item.publisher ?? item.sourceFamily ?? "Retained source",
      href: item.url || `/dashboard/intelligence/documents/${item.documentId}`,
      passage: item.passage,
      matchReason: item.whyMatched,
    })),
    annotations: signal.annotations.map((item) => ({
      date: item.date,
      type: item.actionType,
      label: item.label || item.title,
    })),
  };
}

export function v2SignalsToUi(signals: IntelligenceSignalSummary[]) {
  return signals.map(v2SignalToUi);
}

export function signalChange(signal: TrendSignal) {
  return signal.currentReach - signal.previousReach;
}
