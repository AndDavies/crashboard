import type {
  IntelligenceEvidenceStrength,
  IntelligenceSignalDirection,
  IntelligenceSignalKind,
  IntelligenceSignalLens,
  IntelligenceSignalSeriesPoint,
} from "@/lib/intelligence/signals-v2-types";

export const INTELLIGENCE_SIGNAL_METRIC_VERSION = "signals-v2.1.0";
const DAY_MS = 86_400_000;

export type SignalMeasurementItem = {
  id: string;
  documentId: string;
  date: string;
  tokenCount: number;
  sourceFamily: string;
  authorityTier: string;
  storyId: string;
};

export type SignalMeasurementObservation = {
  itemId: string;
  signalKey: string;
  signalId: string;
  signalKind: IntelligenceSignalKind;
  signalLabel: string;
  mentions: number;
  extractionConfidence: number;
  lensKeys: IntelligenceSignalLens[];
  actionIds?: string[];
};

export type SignalDailyTotal = {
  date: string;
  items: number;
  tokens: number;
};

type MergedObservation = Omit<SignalMeasurementObservation, "actionIds"> & {
  actionIds: Set<string>;
};

export type CanonicalSignalDailyRow = {
  signalKey: string;
  signalId: string;
  signalKind: IntelligenceSignalKind;
  signalLabel: string;
  signalDate: string;
  lensKeys: IntelligenceSignalLens[];
  eligibleItems: number;
  supportingItems: number;
  supportingDocuments: number;
  uniqueStories: number;
  mentionCount: number;
  eligibleTokens: number;
  independentSourceCount: number;
  effectiveSourceCount: number;
  primarySourceCount: number;
  uniqueActionCount: number;
  rawReach: number;
  sourceBalancedReach: number;
  mentionsPer10k: number;
  extractionConfidence: number;
  metadata: {
    sourceFamilies: string[];
    storyIds: string[];
    actionIds: string[];
    documentIds: string[];
    sourceCounts: Record<string, number>;
    eventDedupGenerationId?: string | null;
    storyDedupGenerationId?: string | null;
  };
};

export type CanonicalSignalSummary = {
  signalKey: string;
  signalId: string;
  signalKind: IntelligenceSignalKind;
  signalLabel: string;
  direction: IntelligenceSignalDirection;
  evidenceStrength: IntelligenceEvidenceStrength;
  currentReach: number;
  previousReach: number;
  changePoints: number;
  currentItems: number;
  previousItems: number;
  currentSources: number;
  currentStories: number;
  currentActions: number;
  momentum: number;
  acceleration: number;
  burst: number;
  persistence: number;
  novelty: number;
  confidence: number;
  increaseProbability: number;
  extractionConfidence: number;
  publisherConcentration: number;
  hiddenRankScore: number;
  hasTwelveCompleteWeeks: boolean;
  activeLastFourWeeks: number;
  lensKeys: IntelligenceSignalLens[];
  series: IntelligenceSignalSeriesPoint[];
};

/**
 * Trend series only become actionable once a signal has enough distinct
 * measurement items to satisfy the product's minimum visible support gate.
 * Raw observations remain available to search; this only bounds the canonical
 * daily-series workload and prevents archive singletons from becoming signals.
 */
export function retainGloballySupportedSignalObservations(
  observations: SignalMeasurementObservation[],
  minimumDistinctItems = 3,
) {
  const minimum = Math.max(1, Math.floor(minimumDistinctItems));
  if (minimum === 1) return observations;

  // Keep at most `minimum` item IDs per key. Most extracted phrases are
  // singletons, so this avoids allocating a Set for every long-tail term.
  const supportBySignal = new Map<string, string[] | true>();
  for (const observation of observations) {
    const support = supportBySignal.get(observation.signalKey);
    if (support === true) continue;
    if (!support) {
      supportBySignal.set(observation.signalKey, [observation.itemId]);
      continue;
    }
    if (support.includes(observation.itemId)) continue;
    if (support.length + 1 >= minimum) {
      supportBySignal.set(observation.signalKey, true);
      continue;
    }
    support.push(observation.itemId);
  }

  return observations.filter((observation) =>
    supportBySignal.get(observation.signalKey) === true
  );
}

function round(value: number, places = 8) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  return dateKey(new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS));
}

function inverseSimpson(counts: number[]) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return 0;
  const concentration = counts.reduce((sum, count) => sum + (count / total) ** 2, 0);
  return concentration ? 1 / concentration : 0;
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t -
    0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function increaseProbability(
  currentSupport: number,
  currentEligible: number,
  previousSupport: number,
  previousEligible: number,
) {
  if (!currentEligible || !previousEligible) return 0.5;
  const current = currentSupport / currentEligible;
  const previous = previousSupport / previousEligible;
  const pooled = (currentSupport + previousSupport) / (currentEligible + previousEligible);
  const error = Math.sqrt(
    Math.max(0, pooled * (1 - pooled) * (1 / currentEligible + 1 / previousEligible)),
  );
  if (!error) return current === previous ? 0.5 : current > previous ? 1 : 0;
  return normalCdf((current - previous) / error);
}

function slope(values: number[]) {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - xMean) * (values[index] - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator ? numerator / denominator : 0;
}

function uniqueMetadata(rows: CanonicalSignalDailyRow[], field: "sourceFamilies" | "storyIds" | "actionIds") {
  return new Set(rows.flatMap((row) => row.metadata[field]));
}

function periodStats(
  rows: CanonicalSignalDailyRow[],
  totals: Map<string, { items: number; tokens: number }>,
  start: string,
  end: string,
) {
  const selected = rows.filter((row) => row.signalDate >= start && row.signalDate <= end);
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  const eligible = dates.reduce((sum, date) => sum + (totals.get(date)?.items ?? 0), 0);
  const support = selected.reduce((sum, row) => sum + row.supportingItems, 0);
  const extractionWeight = selected.reduce((sum, row) => sum + row.supportingItems, 0);
  const extractionConfidence = extractionWeight
    ? selected.reduce((sum, row) => sum + row.extractionConfidence * row.supportingItems, 0) /
      extractionWeight
    : 0;
  const sourceCounts = new Map<string, number>();
  for (const row of selected) {
    for (const [source, count] of Object.entries(row.metadata.sourceCounts)) {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + count);
    }
  }
  return {
    rows: selected,
    eligible,
    support,
    reach: support / Math.max(1, eligible),
    sources: new Set(sourceCounts.keys()),
    stories: uniqueMetadata(selected, "storyIds"),
    actions: uniqueMetadata(selected, "actionIds"),
    sourceCounts,
    extractionConfidence,
  };
}

export function buildCanonicalSignalDailyRows(input: {
  items: SignalMeasurementItem[];
  observations: SignalMeasurementObservation[];
}) {
  const itemById = new Map(input.items.map((item) => [item.id, item]));
  const totals = new Map<string, { items: number; tokens: number; sourceCounts: Map<string, number> }>();
  for (const item of input.items) {
    const total = totals.get(item.date) ?? { items: 0, tokens: 0, sourceCounts: new Map() };
    total.items += 1;
    total.tokens += Math.max(0, item.tokenCount);
    total.sourceCounts.set(item.sourceFamily, (total.sourceCounts.get(item.sourceFamily) ?? 0) + 1);
    totals.set(item.date, total);
  }

  const merged = new Map<string, MergedObservation>();
  for (const observation of input.observations) {
    if (!itemById.has(observation.itemId)) continue;
    const key = `${observation.itemId}|${observation.signalKey}`;
    const existing = merged.get(key);
    if (existing) {
      existing.mentions = Math.min(5, existing.mentions + Math.max(0, observation.mentions));
      existing.extractionConfidence = Math.max(
        existing.extractionConfidence,
        observation.extractionConfidence,
      );
      for (const actionId of observation.actionIds ?? []) existing.actionIds.add(actionId);
      existing.lensKeys = [...new Set([...existing.lensKeys, ...observation.lensKeys])];
    } else {
      merged.set(key, {
        ...observation,
        mentions: Math.min(5, Math.max(0, observation.mentions)),
        actionIds: new Set(observation.actionIds ?? []),
      });
    }
  }

  const groups = new Map<string, MergedObservation[]>();
  for (const observation of merged.values()) {
    const item = itemById.get(observation.itemId)!;
    const key = `${observation.signalKey}|${item.date}`;
    const group = groups.get(key) ?? [];
    group.push(observation);
    groups.set(key, group);
  }

  const rows: CanonicalSignalDailyRow[] = [];
  for (const observations of groups.values()) {
    const descriptor = observations[0];
    const items = observations.map((observation) => itemById.get(observation.itemId)!);
    const date = items[0].date;
    const total = totals.get(date)!;
    const sourceCounts = new Map<string, number>();
    for (const item of items) {
      sourceCounts.set(item.sourceFamily, (sourceCounts.get(item.sourceFamily) ?? 0) + 1);
    }
    const sourceBalancedReach = [...total.sourceCounts.entries()].reduce(
      (sum, [source, eligible]) => sum + (sourceCounts.get(source) ?? 0) / Math.max(1, eligible),
      0,
    ) / Math.max(1, total.sourceCounts.size);
    const mentionCount = observations.reduce((sum, observation) => sum + observation.mentions, 0);
    const extractionConfidence = observations.reduce(
      (sum, observation) => sum + observation.extractionConfidence,
      0,
    ) / Math.max(1, observations.length);
    const sources = [...sourceCounts.keys()];
    const actionIds = [...new Set(observations.flatMap((observation) => [...observation.actionIds]))];
    rows.push({
      signalKey: descriptor.signalKey,
      signalId: descriptor.signalId,
      signalKind: descriptor.signalKind,
      signalLabel: descriptor.signalLabel,
      signalDate: date,
      lensKeys: [...new Set(["all" as const, ...observations.flatMap((row) => row.lensKeys)])],
      eligibleItems: total.items,
      supportingItems: items.length,
      supportingDocuments: new Set(items.map((item) => item.documentId)).size,
      uniqueStories: new Set(items.map((item) => item.storyId)).size,
      mentionCount,
      eligibleTokens: total.tokens,
      independentSourceCount: sources.length,
      effectiveSourceCount: round(inverseSimpson([...sourceCounts.values()]), 6),
      primarySourceCount: new Set(
        items.filter((item) => item.authorityTier === "primary").map((item) => item.sourceFamily),
      ).size,
      uniqueActionCount: actionIds.length,
      rawReach: round(items.length / Math.max(1, total.items)),
      sourceBalancedReach: round(sourceBalancedReach),
      mentionsPer10k: round(10_000 * mentionCount / Math.max(1, total.tokens), 6),
      extractionConfidence: round(extractionConfidence, 6),
      metadata: {
        sourceFamilies: sources,
        storyIds: [...new Set(items.map((item) => item.storyId))],
        actionIds,
        documentIds: [...new Set(items.map((item) => item.documentId))],
        sourceCounts: Object.fromEntries(sourceCounts),
      },
    });
  }
  return rows.sort((a, b) =>
    a.signalKey.localeCompare(b.signalKey) || a.signalDate.localeCompare(b.signalDate)
  );
}

export function buildSignalDailyTotals(items: SignalMeasurementItem[]): SignalDailyTotal[] {
  const totals = new Map<string, { items: number; tokens: number }>();
  for (const item of items) {
    const total = totals.get(item.date) ?? { items: 0, tokens: 0 };
    total.items += 1;
    total.tokens += Math.max(0, item.tokenCount);
    totals.set(item.date, total);
  }
  return [...totals.entries()]
    .map(([date, total]) => ({ date, ...total }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function summarizeCanonicalSignal(input: {
  rows: CanonicalSignalDailyRow[];
  dailyTotals: Map<string, { items: number; tokens: number }>;
  completeThrough: string;
}): CanonicalSignalSummary | null {
  if (!input.rows.length) return null;
  const descriptor = input.rows[0];
  const currentStart = addDays(input.completeThrough, -27);
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(currentStart, -28);
  const current = periodStats(input.rows, input.dailyTotals, currentStart, input.completeThrough);
  const previous = periodStats(input.rows, input.dailyTotals, previousStart, previousEnd);
  const noveltyBaselineStart = addDays(currentStart, -84);
  const noveltyBaseline = periodStats(
    input.rows,
    input.dailyTotals,
    noveltyBaselineStart,
    previousEnd,
  );
  if (!current.support && !previous.support) return null;
  const probability = increaseProbability(
    current.support,
    current.eligible,
    previous.support,
    previous.eligible,
  );
  const changePoints = 100 * (current.reach - previous.reach);
  const ratio = current.reach / Math.max(previous.reach, 1 / Math.max(1, previous.eligible));

  const weekly: Array<{ current: number; previous: number; active: boolean }> = [];
  for (let index = 0; index < 4; index += 1) {
    const currentWeekStart = addDays(currentStart, index * 7);
    const currentWeek = periodStats(
      input.rows,
      input.dailyTotals,
      currentWeekStart,
      addDays(currentWeekStart, 6),
    );
    const previousWeekStart = addDays(previousStart, index * 7);
    const previousWeek = periodStats(
      input.rows,
      input.dailyTotals,
      previousWeekStart,
      addDays(previousWeekStart, 6),
    );
    weekly.push({
      current: currentWeek.reach,
      previous: previousWeek.reach,
      active: currentWeek.support > 0,
    });
  }
  let persistence = 0;
  for (const week of [...weekly].reverse()) {
    if (!week.active) break;
    persistence += 1;
  }
  const completeWeekCount = Array.from({ length: 12 }, (_, index) => {
    const start = addDays(input.completeThrough, -(index + 1) * 7 + 1);
    const end = addDays(start, 6);
    return periodStats(input.rows, input.dailyTotals, start, end).eligible > 0;
  }).filter(Boolean).length;
  const hasTwelveCompleteWeeks = completeWeekCount === 12;
  const acceleration = hasTwelveCompleteWeeks
    ? slope(weekly.map((week) => week.current)) -
      slope(weekly.map((week) => week.previous))
    : 0;
  const baselineRate = (previous.support + 0.5) / (previous.eligible + 1);
  const currentRate = (current.support + 0.5) / (current.eligible + 1);
  const burst = Math.max(0, Math.min(1, Math.log2(currentRate / baselineRate) / 3));
  const novelty = noveltyBaseline.support <= 1
    ? 1
    : Math.max(0, 1 - noveltyBaseline.support / Math.max(1, current.support));
  const maxSource = Math.max(0, ...current.sourceCounts.values());
  const concentration = maxSource / Math.max(1, current.support);
  const statisticallySupported = probability >= 0.95 || probability <= 0.05;

  let direction: IntelligenceSignalDirection = "sustained";
  if (
    previous.support <= 1 && current.support >= 3 && current.sources.size >= 2 &&
    (novelty >= 0.8 || burst >= 0.25)
  ) {
    direction = "new";
  } else if (
    current.support >= 5 && current.sources.size >= 3 && changePoints >= 0.5 &&
    ratio >= 1.5 && probability >= 0.95
  ) {
    direction = "rising";
  } else if (changePoints <= -0.5 && probability <= 0.05) {
    direction = "cooling";
  }

  let evidenceStrength: IntelligenceEvidenceStrength = "early";
  if (
    current.support >= 5 && current.sources.size >= 3 && concentration <= 0.6 &&
    current.extractionConfidence >= 0.65 && statisticallySupported
  ) {
    evidenceStrength = "strong";
  } else if (
    current.support >= 3 && current.sources.size >= 2 && concentration <= 0.75 &&
    current.extractionConfidence >= 0.6
  ) {
    evidenceStrength = "moderate";
  }

  const confidence = Math.max(0, Math.min(1,
    Math.min(1, current.support / 8) * 0.3 +
    Math.min(1, current.sources.size / 4) * 0.25 +
    (1 - concentration) * 0.2 +
    current.extractionConfidence * 0.15 +
    Math.abs(probability - 0.5) * 2 * 0.1,
  ));
  const momentumComponent = Math.min(1, Math.abs(changePoints) / 5);
  const accelerationComponent = Math.min(1, Math.abs(acceleration) * 100);
  const breadthComponent = Math.min(1, current.sources.size / 5);
  const actionComponent = Math.min(1, current.actions.size / 3);
  const persistenceComponent = Math.min(1, persistence / 4);
  const hiddenRankScore = confidence * (
    momentumComponent * 0.25 +
    Math.max(accelerationComponent, burst) * 0.2 +
    breadthComponent * 0.2 +
    actionComponent * 0.15 +
    persistenceComponent * 0.1 +
    novelty * 0.1
  );

  return {
    signalKey: descriptor.signalKey,
    signalId: descriptor.signalId,
    signalKind: descriptor.signalKind,
    signalLabel: descriptor.signalLabel,
    direction,
    evidenceStrength,
    currentReach: round(current.reach),
    previousReach: round(previous.reach),
    changePoints: round(changePoints, 4),
    currentItems: current.support,
    previousItems: previous.support,
    currentSources: current.sources.size,
    currentStories: current.stories.size,
    currentActions: current.actions.size,
    momentum: round(current.reach - previous.reach),
    acceleration: round(acceleration),
    burst: round(burst, 6),
    persistence,
    novelty: round(novelty, 6),
    confidence: round(confidence, 6),
    increaseProbability: round(probability, 6),
    extractionConfidence: round(current.extractionConfidence, 6),
    publisherConcentration: round(concentration, 6),
    hiddenRankScore: round(hiddenRankScore),
    hasTwelveCompleteWeeks,
    activeLastFourWeeks: weekly.filter((week) => week.active).length,
    lensKeys: [...new Set(input.rows.flatMap((row) => row.lensKeys))],
    series: input.rows.map((row) => ({
      date: row.signalDate,
      shareOfCoverage: round(row.rawReach * 100, 4),
      items: row.supportingItems,
      stories: row.uniqueStories,
      sources: row.independentSourceCount,
      actions: row.uniqueActionCount,
      mentionsPer10k: row.mentionsPer10k,
    })),
  };
}

/**
 * Produces both the current product summary and the historically correct
 * summary for every retained evidence date. Historical rows must be evaluated
 * with that date as their cutoff; copying today's classification backwards
 * would manufacture six-month surge examples.
 */
export function summarizeCanonicalSignalHistory(input: {
  rows: CanonicalSignalDailyRow[];
  dailyTotals: Map<string, { items: number; tokens: number }>;
  completeThrough: string;
}) {
  const groups = new Map<string, CanonicalSignalDailyRow[]>();
  for (const row of input.rows) {
    const group = groups.get(row.signalKey) ?? [];
    group.push(row);
    groups.set(row.signalKey, group);
  }
  const latestByKey = new Map<string, CanonicalSignalSummary>();
  const bySignalDate = new Map<string, CanonicalSignalSummary>();
  for (const [signalKey, rows] of groups) {
    const latest = summarizeCanonicalSignal({
      rows,
      dailyTotals: input.dailyTotals,
      completeThrough: input.completeThrough,
    });
    if (latest) latestByKey.set(signalKey, latest);
    const dates = [...new Set(rows.map((row) => row.signalDate))]
      .filter((date) => date <= input.completeThrough)
      .sort();
    for (const date of dates) {
      const historical = summarizeCanonicalSignal({
        rows,
        dailyTotals: input.dailyTotals,
        completeThrough: date,
      });
      if (historical) bySignalDate.set(`${signalKey}|${date}`, historical);
    }
  }
  return { latestByKey, bySignalDate };
}

export function dailyTotalsFromRows(rows: CanonicalSignalDailyRow[]) {
  const totals = new Map<string, { items: number; tokens: number }>();
  for (const row of rows) {
    const current = totals.get(row.signalDate);
    if (!current || row.eligibleItems > current.items) {
      totals.set(row.signalDate, { items: row.eligibleItems, tokens: row.eligibleTokens });
    }
  }
  return totals;
}

export const __testables = {
  addDays,
  increaseProbability,
  inverseSimpson,
  slope,
};
