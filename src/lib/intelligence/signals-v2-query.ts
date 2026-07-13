import type { CanonicalSignalSummary } from "@/lib/intelligence/signal-metrics-v2";
import { resolveRequestedSignalKey } from "@/lib/intelligence/signal-keys";
import {
  INTELLIGENCE_SIGNAL_KINDS,
  type IntelligenceSignalKind,
  type IntelligenceSignalLens,
} from "@/lib/intelligence/signals-v2-types";

type DbRow = Record<string, unknown>;

export type StoredSignalSummary = {
  key: string;
  summary: CanonicalSignalSummary;
};

export type SignalQueryPlan = {
  filtered: StoredSignalSummary[];
  selected: StoredSignalSummary[];
  compareKeys: string[];
  historyKeys: string[];
};

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentile75(values: number[]) {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.75)] ?? Infinity;
}

/**
 * Restores the canonical summary persisted on every complete-day row. This is
 * intentionally independent of history length, so listing signals never needs
 * to replay hundreds of daily rows per candidate.
 */
export function parseStoredSignalSummary(row: DbRow): StoredSignalSummary | null {
  const metadata = object(row.metadata);
  const stored = object(metadata.summary);
  const key = String(row.signal_key ?? "").trim();
  const signalId = String(row.signal_id ?? "").trim();
  const signalLabel = String(row.signal_label ?? "").trim();
  const signalKind = row.signal_kind as IntelligenceSignalKind;
  if (
    !key || !signalId || !signalLabel ||
    !INTELLIGENCE_SIGNAL_KINDS.includes(signalKind) ||
    !Object.keys(stored).length
  ) return null;

  const direction = row.direction;
  const evidenceStrength = row.evidence_strength;
  if (
    !["new", "rising", "sustained", "cooling"].includes(String(direction)) ||
    !["strong", "moderate", "early"].includes(String(evidenceStrength))
  ) return null;

  return {
    key,
    summary: {
      signalKey: key,
      signalId,
      signalKind,
      signalLabel,
      direction: direction as CanonicalSignalSummary["direction"],
      evidenceStrength: evidenceStrength as CanonicalSignalSummary["evidenceStrength"],
      currentReach: number(stored.current_reach),
      previousReach: number(stored.previous_reach),
      changePoints: number(stored.change_points),
      currentItems: number(stored.current_items),
      previousItems: number(stored.previous_items),
      currentSources: number(stored.sources),
      currentStories: number(stored.stories),
      currentActions: number(stored.actions),
      momentum: number(row.momentum),
      acceleration: number(row.acceleration),
      burst: number(row.burst),
      persistence: number(row.persistence),
      novelty: number(row.novelty),
      confidence: number(row.confidence),
      increaseProbability: number(row.increase_probability),
      extractionConfidence: number(row.extraction_confidence),
      publisherConcentration: 0,
      hiddenRankScore: number(row.hidden_rank_score),
      hasTwelveCompleteWeeks: metadata.has_twelve_complete_weeks === true,
      activeLastFourWeeks: number(metadata.active_last_four_weeks),
      lensKeys: strings(row.lens_keys) as IntelligenceSignalLens[],
      series: [],
    },
  };
}

/**
 * Builds the complete query plan from one persisted row per signal. The
 * historyKeys output is the bounded set that may load a chart/evidence history.
 */
export function buildSignalQueryPlan(input: {
  summaries: StoredSignalSummary[];
  lens: IntelligenceSignalLens;
  kind: IntelligenceSignalKind | "all";
  query?: string;
  compare?: string[];
  limit: number;
}): SignalQueryPlan {
  const quartiles = new Map<IntelligenceSignalKind, number>();
  for (const signalKind of INTELLIGENCE_SIGNAL_KINDS) {
    quartiles.set(signalKind, percentile75(
      input.summaries
        .filter((item) => item.summary.signalKind === signalKind && item.summary.hasTwelveCompleteWeeks)
        .map((item) => item.summary.currentReach),
    ));
  }
  const query = input.query?.replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-CA") ?? "";
  const filtered = input.summaries.filter(({ summary }) => {
    if (input.lens !== "all" && !summary.lensKeys.includes(input.lens)) return false;
    if (input.kind !== "all" && summary.signalKind !== input.kind) return false;
    if (query && !summary.signalLabel.toLocaleLowerCase("en-CA").includes(query)) return false;
    if (summary.direction === "sustained") {
      return summary.hasTwelveCompleteWeeks && summary.activeLastFourWeeks >= 3 &&
        summary.currentReach >= (quartiles.get(summary.signalKind) ?? Infinity) &&
        summary.currentItems >= 3;
    }
    if (summary.direction === "cooling") return summary.previousItems >= 3;
    return summary.currentItems >= 3;
  }).sort((a, b) => b.summary.hiddenRankScore - a.summary.hiddenRankScore);

  const candidates = input.summaries.map(({ key, summary }) => ({
    key,
    id: summary.signalId,
    label: summary.signalLabel,
  }));
  const compareKeys = [...new Set((input.compare ?? []).flatMap((requested) =>
    resolveRequestedSignalKey(requested, candidates) ?? []
  ))].slice(0, 5);
  const selected = filtered.slice(0, input.limit);
  const historyKeys = [...new Set([...selected.map((item) => item.key), ...compareKeys])];
  return { filtered, selected, compareKeys, historyKeys };
}

export function chunkSignalKeys(keys: string[], size = 20) {
  const boundedSize = Math.max(1, Math.floor(size));
  return Array.from(
    { length: Math.ceil(keys.length / boundedSize) },
    (_, index) => keys.slice(index * boundedSize, index * boundedSize + boundedSize),
  );
}
