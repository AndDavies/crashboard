export const INTELLIGENCE_METRIC_VERSION = "signal-metrics-v1";
export const INTELLIGENCE_ANALYTICS_TIME_ZONE = "America/Halifax";

export type SignalWindowType = "weekly" | "pulse" | "operating" | "strategic";

export type SignalWindow = {
  windowType: SignalWindowType;
  periodStart: string;
  periodEnd: string;
  baselineStart: string;
  baselineEnd: string;
};

export type EligibleDocument = {
  id: string;
  dateKey: string;
  source: string;
  channel: string;
};

export type EligibleUnit = {
  id: string;
  documentId: string;
  dateKey: string;
  source: string;
  channel: string;
};

export type AttentionSupport = EligibleUnit & {
  mentionCount: number;
  confidence: number;
};

export type ActionSupport = {
  id: string;
  eventId: string;
  documentIds: string[];
  dateKey: string;
  sources: string[];
  channels: string[];
  confidence: number;
};

export type SignalMetricInput = {
  window: SignalWindow;
  attentionUnit: "document" | "segment";
  currentDocuments: EligibleDocument[];
  baselineDocuments: EligibleDocument[];
  currentUnits: EligibleUnit[];
  baselineUnits: EligibleUnit[];
  currentAttention: AttentionSupport[];
  baselineAttention: AttentionSupport[];
  currentActions: ActionSupport[];
  baselineActions: ActionSupport[];
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

export function shiftDateKey(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateKeyInTimeZone(
  value: Date | string,
  timeZone = INTELLIGENCE_ANALYTICS_TIME_ZONE,
) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function latestCompleteDateKey(anchor = new Date()) {
  return shiftDateKey(dateKeyInTimeZone(anchor), -1);
}

function mondayForDateKey(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return shiftDateKey(value, -offset);
}

export function buildSignalWindows(input: {
  earliestDateKey: string;
  anchor?: Date;
}) {
  const end = latestCompleteDateKey(input.anchor);
  const windows: SignalWindow[] = [
    {
      windowType: "pulse",
      periodStart: shiftDateKey(end, -6),
      periodEnd: end,
      baselineStart: shiftDateKey(end, -34),
      baselineEnd: shiftDateKey(end, -7),
    },
    {
      windowType: "operating",
      periodStart: shiftDateKey(end, -27),
      periodEnd: end,
      baselineStart: shiftDateKey(end, -111),
      baselineEnd: shiftDateKey(end, -28),
    },
    {
      windowType: "strategic",
      periodStart: shiftDateKey(end, -89),
      periodEnd: end,
      baselineStart: shiftDateKey(end, -179),
      baselineEnd: shiftDateKey(end, -90),
    },
  ];

  let weekStart = mondayForDateKey(input.earliestDateKey);
  while (shiftDateKey(weekStart, 6) <= end) {
    const periodEnd = shiftDateKey(weekStart, 6);
    windows.push({
      windowType: "weekly",
      periodStart: weekStart,
      periodEnd,
      baselineStart: shiftDateKey(weekStart, -28),
      baselineEnd: shiftDateKey(weekStart, -1),
    });
    weekStart = shiftDateKey(weekStart, 7);
  }
  return windows;
}

export function withinDateWindow(value: string, start: string, end: string) {
  return value >= start && value <= end;
}

function normalizedRate(numerator: number, denominator: number) {
  return denominator > 0 ? (100 * numerator) / denominator : 0;
}

function wilsonInterval(successes: number, total: number) {
  if (total <= 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
    denominator;
  return { low: clamp(center - margin), high: clamp(center + margin) };
}

function erf(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const result =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return sign * result;
}

function normalCdf(value: number) {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

function increaseProbability(currentSuccesses: number, currentTotal: number, baselineSuccesses: number, baselineTotal: number) {
  if (!currentTotal || !baselineTotal) return 0;
  const current = currentSuccesses / currentTotal;
  const baseline = baselineSuccesses / baselineTotal;
  const pooled = (currentSuccesses + baselineSuccesses) / (currentTotal + baselineTotal);
  const standardError = Math.sqrt(
    Math.max(0, pooled * (1 - pooled) * (1 / currentTotal + 1 / baselineTotal)),
  );
  if (!standardError) return current > baseline ? 1 : 0.5;
  return normalCdf((current - baseline) / standardError);
}

function sourceMetrics(attention: AttentionSupport[]) {
  const bySource = new Map<string, Set<string>>();
  for (const support of attention) {
    if (!bySource.has(support.source)) bySource.set(support.source, new Set());
    bySource.get(support.source)?.add(support.documentId);
  }
  const counts = [...bySource.values()].map((documents) => documents.size);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const shares = total ? counts.map((count) => count / total) : [];
  const hhi = shares.reduce((sum, share) => sum + share * share, 0);
  return {
    sources: new Set(attention.map((support) => support.source)),
    concentration: shares.length ? Math.max(...shares) : 0,
    effectiveSources: hhi > 0 ? 1 / hhi : 0,
  };
}

function balancedDocumentPrevalence(
  documents: EligibleDocument[],
  attention: AttentionSupport[],
) {
  const eligibleBySource = new Map<string, Set<string>>();
  const supportBySource = new Map<string, Set<string>>();
  for (const document of documents) {
    if (!eligibleBySource.has(document.source)) eligibleBySource.set(document.source, new Set());
    eligibleBySource.get(document.source)?.add(document.id);
  }
  for (const support of attention) {
    if (!supportBySource.has(support.source)) supportBySource.set(support.source, new Set());
    supportBySource.get(support.source)?.add(support.documentId);
  }
  const totalDocuments = unique(documents.map((document) => document.id)).length;
  const supportedDocuments = unique(attention.map((support) => support.documentId)).length;
  const pooled = totalDocuments ? supportedDocuments / totalDocuments : 0;
  return (
    100 *
    mean(
      [...eligibleBySource.entries()].map(([source, eligible]) => {
        const support = supportBySource.get(source)?.size ?? 0;
        return (support + 5 * pooled) / (eligible.size + 5);
      }),
    )
  );
}

function weekKey(value: string) {
  return mondayForDateKey(value);
}

export function calculateSignalMetric(input: SignalMetricInput) {
  const currentUnitDenominator = unique(
    (input.attentionUnit === "segment" ? input.currentUnits : input.currentDocuments).map(
      (unit) => unit.id,
    ),
  ).length;
  const baselineUnitDenominator = unique(
    (input.attentionUnit === "segment" ? input.baselineUnits : input.baselineDocuments).map(
      (unit) => unit.id,
    ),
  ).length;
  const currentUnitSupport = unique(input.currentAttention.map((support) => support.id)).length;
  const baselineUnitSupport = unique(input.baselineAttention.map((support) => support.id)).length;
  const currentDocumentSupport = unique(
    input.currentAttention.map((support) => support.documentId),
  ).length;
  const baselineDocumentSupport = unique(
    input.baselineAttention.map((support) => support.documentId),
  ).length;
  const currentDocuments = unique(input.currentDocuments.map((document) => document.id)).length;
  const baselineDocuments = unique(input.baselineDocuments.map((document) => document.id)).length;
  const currentActions = unique(input.currentActions.map((action) => action.id)).length;
  const baselineActions = unique(input.baselineActions.map((action) => action.id)).length;
  const currentRate = normalizedRate(currentUnitSupport, currentUnitDenominator);
  const baselineRate = normalizedRate(baselineUnitSupport, baselineUnitDenominator);
  const eventRate = normalizedRate(currentActions, currentDocuments);
  const baselineEventRate = normalizedRate(baselineActions, baselineDocuments);
  const log2Momentum = Math.log2((currentRate + 0.5) / (baselineRate + 0.5));
  const momentum = clamp((Math.max(-3, Math.min(3, log2Momentum)) + 3) / 6);
  const currentSource = sourceMetrics(input.currentAttention);
  const baselineSources = new Set(input.baselineAttention.map((support) => support.source));
  const union = new Set([...currentSource.sources, ...baselineSources]);
  const overlap = union.size
    ? [...currentSource.sources].filter((source) => baselineSources.has(source)).length / union.size
    : 0;
  const activeWeeks = new Set(
    [...input.currentAttention, ...input.baselineAttention].map((support) => weekKey(support.dateKey)),
  ).size;
  const possibleWeeks = Math.max(
    1,
    Math.ceil(
      (new Date(`${input.window.periodEnd}T12:00:00Z`).getTime() -
        new Date(`${input.window.baselineStart}T12:00:00Z`).getTime()) /
        604_800_000,
    ),
  );
  const persistence = clamp(activeWeeks / possibleWeeks);
  const evidenceConfidence = clamp(
    mean([
      ...input.currentAttention.map((support) => support.confidence),
      ...input.currentActions.map((action) => action.confidence),
    ]),
  );
  const sourceDiversity = clamp(Math.log1p(currentSource.sources.size) / Math.log(7));
  const trendStrength = Number(
    (
      100 *
      (0.35 * momentum +
        0.25 * sourceDiversity +
        0.2 * persistence +
        0.2 * evidenceConfidence)
    ).toFixed(2),
  );
  const interval = wilsonInterval(currentUnitSupport, currentUnitDenominator);
  const probability = increaseProbability(
    currentUnitSupport,
    currentUnitDenominator,
    baselineUnitSupport,
    baselineUnitDenominator,
  );
  const balancedPrevalence = balancedDocumentPrevalence(
    input.currentDocuments,
    input.currentAttention,
  );
  const baselineBalancedPrevalence = balancedDocumentPrevalence(
    input.baselineDocuments,
    input.baselineAttention,
  );
  let qualificationStatus:
    | "qualified"
    | "insufficient_support"
    | "incomplete_coverage"
    | "source_concentrated"
    | "low_confidence" = "qualified";
  if (currentDocuments < 25 || baselineDocuments < 50) {
    qualificationStatus = "incomplete_coverage";
  } else if (currentUnitSupport < 5 || currentSource.sources.size < 3) {
    qualificationStatus = "insufficient_support";
  } else if (currentSource.concentration > 0.6) {
    qualificationStatus = "source_concentrated";
  } else if (evidenceConfidence < 0.65) {
    qualificationStatus = "low_confidence";
  }

  return {
    documentCount: currentDocuments,
    eligibleDocumentCount: currentDocuments,
    supportingDocumentCount: currentDocumentSupport,
    supportingUnitCount: currentUnitSupport,
    eligibleUnitCount: currentUnitDenominator,
    mentionCount: input.currentAttention.reduce(
      (sum, support) => sum + Math.min(5, Math.max(0, support.mentionCount)),
      0,
    ),
    clusterCount: currentActions,
    eventCount: currentActions,
    independentSourceCount: currentSource.sources.size,
    mentionRate: currentRate,
    documentPrevalence: normalizedRate(currentDocumentSupport, currentDocuments),
    balancedPrevalence,
    eventRate,
    baselineDocumentCount: baselineDocuments,
    baselineSupportingDocumentCount: baselineDocumentSupport,
    baselineSupportingUnitCount: baselineUnitSupport,
    baselineUnitCount: baselineUnitDenominator,
    baselineEventCount: baselineActions,
    baselineSourceCount: baselineSources.size,
    baselineMentionRate: baselineRate,
    baselineDocumentPrevalence: normalizedRate(
      baselineDocumentSupport,
      baselineDocuments,
    ),
    baselineBalancedPrevalence,
    baselineEventRate,
    log2Momentum,
    absoluteDelta: currentRate - baselineRate,
    momentum,
    sourceDiversity,
    persistence,
    evidenceConfidence,
    trendStrength,
    publisherConcentration: currentSource.concentration,
    effectiveSourceCount: currentSource.effectiveSources,
    sourceOverlap: overlap,
    confidenceLow: interval.low,
    confidenceHigh: interval.high,
    increaseProbability: probability,
    novelty:
      baselineUnitSupport === 0 &&
      currentUnitSupport >= 5 &&
      currentSource.sources.size >= 3,
    qualificationStatus,
    concentrationWarning: currentSource.concentration > 0.4,
    alertQualified:
      qualificationStatus === "qualified" &&
      currentUnitSupport >= 5 &&
      currentSource.sources.size >= 3 &&
      currentRate >= Math.max(1.5 * baselineRate, baselineRate + 0.5) &&
      probability >= 0.95,
  };
}

export const __testables = {
  balancedDocumentPrevalence,
  increaseProbability,
  mondayForDateKey,
  normalCdf,
  sourceMetrics,
  wilsonInterval,
};
