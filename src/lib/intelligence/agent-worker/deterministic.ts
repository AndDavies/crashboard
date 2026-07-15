import { createHash } from "node:crypto";
import type {
  IntelligenceSignalDirection,
  IntelligenceSignalKind,
  IntelligenceSignalSummary,
} from "@/lib/intelligence/signals-v2-types";
import type { IntelligenceStoredDocument } from "@/lib/intelligence/store";
import {
  auditSignalLabels,
  extractSignalObservations,
  genericWhatToWatch,
  genericWhyItMatters,
  isBlockedSignalLabel,
  isObviousBoilerplateDocument,
  normalizeSignalText,
  type SignalObservation,
} from "./signal-language";

const DAY_MS = 86_400_000;
const ACTION_PATTERN = /\b(?:acquir(?:e|ed|es|ing)|award(?:ed|s)?|buy(?:ing)?|contract(?:ed|s)?|deploy(?:ed|ing|ment|ments)?|fund(?:ed|ing|s)?|launch(?:ed|es|ing)?|order(?:ed|s)?|procure(?:d|ment|ments)?|purchas(?:e|ed|es|ing)|rfi|rfp|selected|signed|solicitation|tender|tested|testing|trial(?:led|ed|ing|s)?)\b/iu;

type ObservedDocument = {
  document: IntelligenceStoredDocument;
  observations: Map<string, SignalObservation>;
  storyKey: string;
};

type Candidate = {
  definition: SignalObservation;
  supporting: ObservedDocument[];
  current: ObservedDocument[];
  previous: ObservedDocument[];
  currentReach: number;
  previousReach: number;
  currentBalancedReach: number;
  previousBalancedReach: number;
  sources: number;
  previousSources: number;
  stories: number;
  previousStories: number;
  titleItems: number;
  direction: IntelligenceSignalDirection;
  rankScore: number;
};

function weekStart(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function canonicalStoryKey(document: IntelligenceStoredDocument) {
  if (document.canonicalUrl) {
    try {
      const url = new URL(document.canonicalUrl);
      if (url.hostname === "mail.google.com") throw new Error("Newsletter container URL is not a story URL.");
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/^(?:utm_|mc_|ref$|source$|campaign$)/iu.test(key)) url.searchParams.delete(key);
      }
      return `url:${url.toString().replace(/\/$/u, "")}`;
    } catch {
      // Fall through to the retained hashes.
    }
  }
  if (document.contentHash) return `hash:${document.contentHash}`;
  return `title:${normalizeSignalText(document.title)}`;
}

function eligibleDocument(document: IntelligenceStoredDocument) {
  if (!document.publishedAt || !Number.isFinite(Date.parse(document.publishedAt))) return false;
  if (Date.parse(document.publishedAt) > Date.now() + DAY_MS) return false;
  if (isObviousBoilerplateDocument(document.title, document.contentText)) return false;
  return normalizeSignalText(`${document.title} ${document.contentText}`).split(" ").filter(Boolean).length >= 12;
}

function uniqueCount(values: string[]) {
  return new Set(values).size;
}

function sourceBalancedReach(supporting: ObservedDocument[], eligible: ObservedDocument[]) {
  if (!eligible.length) return 0;
  const eligibleBySource = new Map<string, number>();
  const supportBySource = new Map<string, number>();
  for (const item of eligible) {
    eligibleBySource.set(item.document.sourceFamily, (eligibleBySource.get(item.document.sourceFamily) ?? 0) + 1);
  }
  for (const item of supporting) {
    supportBySource.set(item.document.sourceFamily, (supportBySource.get(item.document.sourceFamily) ?? 0) + 1);
  }
  let weightedReach = 0;
  let totalWeight = 0;
  for (const [source, total] of eligibleBySource) {
    // A source with dozens of segmented items should not dominate, while a
    // source with one item should not receive the same confidence as five.
    const weight = Math.sqrt(Math.min(total, 9));
    weightedReach += ((supportBySource.get(source) ?? 0) / total) * weight;
    totalWeight += weight;
  }
  return totalWeight ? weightedReach / totalWeight : 0;
}

function twoProportionZ(currentItems: number, currentEligible: number, previousItems: number, previousEligible: number) {
  if (!currentEligible || !previousEligible) return 0;
  const current = currentItems / currentEligible;
  const previous = previousItems / previousEligible;
  const pooled = (currentItems + previousItems) / (currentEligible + previousEligible);
  const error = Math.sqrt(pooled * (1 - pooled) * ((1 / currentEligible) + (1 / previousEligible)));
  return error ? (current - previous) / error : 0;
}

function classifyDirection(candidate: Omit<Candidate, "direction" | "rankScore">, currentEligible: number, previousEligible: number) {
  const change = candidate.currentReach - candidate.previousReach;
  const z = twoProportionZ(candidate.current.length, currentEligible, candidate.previous.length, previousEligible);
  if (
    candidate.previousStories <= 1 &&
    candidate.current.length >= 3 &&
    candidate.stories >= 3 &&
    candidate.sources >= 2
  ) return "new" as const;
  if (
    candidate.current.length >= 5 &&
    candidate.stories >= 4 &&
    candidate.sources >= 3 &&
    change >= 0.005 &&
    candidate.currentReach >= candidate.previousReach * 1.5 &&
    z >= 1.96
  ) return "rising" as const;
  if (
    candidate.previous.length >= 5 &&
    candidate.previousStories >= 4 &&
    candidate.previousSources >= 3 &&
    change <= -0.005 &&
    z <= -1.96
  ) return "cooling" as const;
  return "sustained" as const;
}

function extractionWeight(extraction: SignalObservation["extraction"]) {
  return extraction === "taxonomy" ? 1.35 : extraction === "identifier" ? 1.2 : 1;
}

function rankCandidate(candidate: Omit<Candidate, "rankScore">) {
  const rawChange = Math.abs(candidate.currentReach - candidate.previousReach);
  const balancedChange = Math.abs(candidate.currentBalancedReach - candidate.previousBalancedReach);
  const titleRate = candidate.titleItems / Math.max(1, candidate.current.length + candidate.previous.length);
  const breadth = Math.log2(1 + Math.max(candidate.sources, candidate.previousSources)) / 5;
  const prominence = Math.max(candidate.currentBalancedReach, candidate.previousBalancedReach);
  const movementBonus = candidate.direction === "new" || candidate.direction === "rising"
    ? 1.3
    : candidate.direction === "cooling" ? 1.15 : 1;
  return extractionWeight(candidate.definition.extraction) * movementBonus * (
    balancedChange * 5 +
    rawChange * 2 +
    prominence * 0.45 +
    titleRate * 0.12 +
    breadth * 0.1
  );
}

function candidateHasEnoughSupport(candidate: Omit<Candidate, "direction" | "rankScore">) {
  const currentSupported = candidate.current.length >= 3 && candidate.stories >= 2 && candidate.sources >= 2;
  const previousSupported = candidate.previous.length >= 3 && candidate.previousStories >= 2 && candidate.previousSources >= 2;
  if (!currentSupported && !previousSupported) return false;
  if (candidate.definition.extraction === "phrase") {
    return candidate.titleItems >= 2 && (candidate.stories >= 3 || candidate.previousStories >= 3);
  }
  if (candidate.definition.extraction === "identifier") {
    return candidate.titleItems >= 1 && (candidate.stories >= 2 || candidate.previousStories >= 2);
  }
  return true;
}

function directionHasEnoughSupport(candidate: Omit<Candidate, "rankScore">) {
  if (candidate.direction === "cooling") {
    return candidate.previous.length >= 5 && candidate.previousStories >= 4 && candidate.previousSources >= 3;
  }
  return candidate.current.length >= 3 && candidate.stories >= 2 && candidate.sources >= 2;
}

function actionEvidenceText(item: ObservedDocument) {
  return `${item.document.title}\n${item.document.contentText.slice(0, 700)}`;
}

function evidenceStrength(candidate: Candidate) {
  const sourceCounts = new Map<string, number>();
  for (const item of candidate.current) {
    sourceCounts.set(item.document.sourceFamily, (sourceCounts.get(item.document.sourceFamily) ?? 0) + 1);
  }
  const concentration = candidate.current.length
    ? Math.max(0, ...sourceCounts.values()) / candidate.current.length
    : 1;
  if (candidate.current.length >= 5 && candidate.stories >= 4 && candidate.sources >= 3 && concentration <= 0.6) return "strong" as const;
  if (candidate.current.length >= 3 && candidate.stories >= 2 && candidate.sources >= 2 && concentration <= 0.75) return "moderate" as const;
  return "early" as const;
}

function actionType(value: string) {
  if (/\baward(?:ed|s)?|contract(?:ed|s)?\b/iu.test(value)) return "Contract awarded";
  if (/\bfund(?:ed|ing|s)?\b/iu.test(value)) return "Funding";
  if (/\btrial(?:led|ed|ing|s)?|test(?:ed|ing|s)?\b/iu.test(value)) return "Being tested";
  if (/\bdeploy(?:ed|ing|ment|ments)?\b/iu.test(value)) return "Entering use";
  if (/\bprocure(?:d|ment|ments)?|purchas(?:e|ed|es|ing)|order(?:ed|s)?|rfi|rfp|solicitation|tender\b/iu.test(value)) return "Buying activity";
  return "Announcement";
}

function diverseEvidence(items: ObservedDocument[], limit = 5) {
  const ordered = [...items].sort((a, b) => Date.parse(b.document.publishedAt!) - Date.parse(a.document.publishedAt!));
  const sourceCounts = new Map<string, number>();
  const selected: ObservedDocument[] = [];
  for (const item of ordered) {
    const source = item.document.sourceFamily;
    if ((sourceCounts.get(source) ?? 0) >= 2) continue;
    selected.push(item);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}

function signalId(candidate: Candidate) {
  return createHash("sha256")
    .update(`${candidate.definition.kind}:${candidate.definition.key}`)
    .digest("hex")
    .slice(0, 24);
}

function buildCandidateSeries(candidate: Candidate, orderedWeeks: Array<[string, ObservedDocument[]]>) {
  return orderedWeeks.map(([date, eligible]) => {
    const supporting = eligible.filter((item) => item.observations.has(candidate.definition.key));
    const mentions = supporting.reduce((sum, item) => sum + (item.observations.get(candidate.definition.key)?.mentions ?? 0), 0);
    const tokens = eligible.reduce((sum, item) => sum + item.document.editorialTokens, 0);
    const actions = new Set(
      supporting
        .filter((item) => ACTION_PATTERN.test(actionEvidenceText(item)))
        .map((item) => item.storyKey),
    ).size;
    return {
      date,
      shareOfCoverage: supporting.length / Math.max(1, eligible.length),
      items: supporting.length,
      stories: uniqueCount(supporting.map((item) => item.storyKey)),
      sources: uniqueCount(supporting.map((item) => item.document.sourceFamily)),
      actions,
      mentionsPer10k: tokens ? (mentions * 10_000) / tokens : 0,
    };
  });
}

function chooseCandidates(candidates: Candidate[], limit = 80) {
  const selected: Candidate[] = [];
  const seen = new Set<string>();
  const take = (candidate: Candidate) => {
    const key = `${candidate.definition.kind}:${normalizeSignalText(candidate.definition.label)}`;
    if (seen.has(key) || selected.length >= limit) return;
    seen.add(key);
    selected.push(candidate);
  };
  const sorted = [...candidates].sort((a, b) => b.rankScore - a.rankScore);
  const kindFloor: Record<IntelligenceSignalKind, number> = {
    topic: 12,
    keyword: 8,
    organization: 8,
    system: 8,
    programme: 5,
  };
  for (const kind of Object.keys(kindFloor) as IntelligenceSignalKind[]) {
    sorted.filter((candidate) => candidate.definition.kind === kind).slice(0, kindFloor[kind]).forEach(take);
  }
  const directionLimit: Record<IntelligenceSignalDirection, number> = {
    new: 18,
    rising: 24,
    sustained: 24,
    cooling: 14,
  };
  for (const direction of Object.keys(directionLimit) as IntelligenceSignalDirection[]) {
    sorted.filter((candidate) => candidate.direction === direction).slice(0, directionLimit[direction]).forEach(take);
  }
  sorted.forEach(take);
  return selected.slice(0, limit);
}

export function buildDeterministicSignals(documents: IntelligenceStoredDocument[]): IntelligenceSignalSummary[] {
  const observed: ObservedDocument[] = documents
    .filter(eligibleDocument)
    .map((document) => ({
      document,
      observations: new Map(
        [...extractSignalObservations(document.title, document.contentText)].map(([, value]) => [
          `${value.kind}:${value.key}`,
          { ...value, key: `${value.kind}:${value.key}` },
        ]),
      ),
      storyKey: canonicalStoryKey(document),
    }));
  if (!observed.length) return [];

  const latest = Math.max(...observed.map((item) => Date.parse(item.document.publishedAt!)));
  const currentStart = latest - 27 * DAY_MS;
  const previousStart = currentStart - 28 * DAY_MS;
  const currentEligible = observed.filter((item) => Date.parse(item.document.publishedAt!) >= currentStart);
  const previousEligible = observed.filter((item) => {
    const date = Date.parse(item.document.publishedAt!);
    return date >= previousStart && date < currentStart;
  });

  const weeks = new Map<string, ObservedDocument[]>();
  for (const item of observed) {
    const week = weekStart(item.document.publishedAt!);
    const eligible = weeks.get(week) ?? [];
    eligible.push(item);
    weeks.set(week, eligible);
  }
  const orderedWeeks = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  const signalDocuments = new Map<string, ObservedDocument[]>();
  const definitions = new Map<string, SignalObservation>();
  const sourceLabels = new Set(observed.map((item) => normalizeSignalText(item.document.sourceFamily)));
  for (const item of observed) {
    for (const [key, observation] of item.observations) {
      const supporting = signalDocuments.get(key) ?? [];
      supporting.push(item);
      signalDocuments.set(key, supporting);
      definitions.set(key, observation);
    }
  }

  const candidates: Candidate[] = [];
  for (const [key, supporting] of signalDocuments) {
    const definition = definitions.get(key)!;
    if (isBlockedSignalLabel(definition.label) || sourceLabels.has(normalizeSignalText(definition.label))) continue;
    const current = supporting.filter((item) => Date.parse(item.document.publishedAt!) >= currentStart);
    const previous = supporting.filter((item) => {
      const date = Date.parse(item.document.publishedAt!);
      return date >= previousStart && date < currentStart;
    });
    const base = {
      definition,
      supporting,
      current,
      previous,
      currentReach: current.length / Math.max(1, currentEligible.length),
      previousReach: previous.length / Math.max(1, previousEligible.length),
      currentBalancedReach: sourceBalancedReach(current, currentEligible),
      previousBalancedReach: sourceBalancedReach(previous, previousEligible),
      sources: uniqueCount(current.map((item) => item.document.sourceFamily)),
      previousSources: uniqueCount(previous.map((item) => item.document.sourceFamily)),
      stories: uniqueCount(current.map((item) => item.storyKey)),
      previousStories: uniqueCount(previous.map((item) => item.storyKey)),
      titleItems: supporting.filter((item) => (item.observations.get(key)?.titleMentions ?? 0) > 0).length,
    };
    if (!candidateHasEnoughSupport(base)) continue;
    const direction = classifyDirection(base, currentEligible.length, previousEligible.length);
    const withDirection = { ...base, direction };
    if (!directionHasEnoughSupport(withDirection)) continue;
    candidates.push({ ...withDirection, rankScore: rankCandidate(withDirection) });
  }

  const selected = chooseCandidates(candidates);
  const candidateById = new Map(selected.map((candidate) => [signalId(candidate), candidate]));
  const signals = selected.map((candidate): IntelligenceSignalSummary => {
    const id = signalId(candidate);
    const series = buildCandidateSeries(candidate, orderedWeeks);
    const change = candidate.currentReach - candidate.previousReach;
    const currentActions = new Map<string, ObservedDocument>();
    for (const item of candidate.current) {
      if (ACTION_PATTERN.test(actionEvidenceText(item))) currentActions.set(item.storyKey, item);
    }
    const supportingEvidence = candidate.current.length ? candidate.current : candidate.previous;
    return {
      id,
      key: `${candidate.definition.kind}:${candidate.definition.key}`,
      kind: candidate.definition.kind,
      label: candidate.definition.label,
      direction: candidate.direction,
      evidenceStrength: evidenceStrength(candidate),
      currentReach: candidate.currentReach,
      previousReach: candidate.previousReach,
      changePoints: change * 100,
      currentItems: candidate.current.length,
      previousItems: candidate.previous.length,
      stories: candidate.stories,
      sources: candidate.sources,
      actions: currentActions.size,
      momentum: candidate.previousReach ? candidate.currentReach / candidate.previousReach : candidate.currentReach ? 2 : 0,
      acceleration: series.length >= 3 ? series.at(-1)!.shareOfCoverage - series.at(-2)!.shareOfCoverage : 0,
      burst: Math.max(0, candidate.currentBalancedReach - candidate.previousBalancedReach),
      persistenceWeeks: series.slice(-4).filter((point) => point.items > 0).length,
      novelty: candidate.previousStories <= 1 ? 1 : 0,
      whyNow: `${candidate.definition.label} appears in ${(candidate.currentReach * 100).toFixed(1)}% of current coverage, ${change >= 0 ? "up from" : "down from"} ${(candidate.previousReach * 100).toFixed(1)}%, across ${candidate.stories} unique ${candidate.stories === 1 ? "story" : "stories"} from ${candidate.sources} ${candidate.sources === 1 ? "source" : "sources"}.`,
      whyItMatters: genericWhyItMatters(candidate.definition),
      whatToWatch: genericWhatToWatch(candidate.definition),
      lensKeys: candidate.definition.lensKeys,
      series,
      related: [],
      evidence: diverseEvidence(supportingEvidence).map((item, index) => ({
        id: `${id}:${index}`,
        documentId: item.document.id,
        title: item.document.title,
        passage: item.document.contentText.slice(0, 600),
        url: item.document.canonicalUrl ?? null,
        publisher: item.document.publisher ?? null,
        publishedAt: item.document.publishedAt ?? null,
        sourceFamily: item.document.sourceFamily,
        authority: "retained source",
        storyId: item.storyKey,
        whyMatched: candidate.definition.extraction === "taxonomy"
          ? `Uses terminology associated with ${candidate.definition.label}.`
          : candidate.definition.extraction === "identifier"
            ? `Contains the exact identifier ${candidate.definition.label}.`
            : `Contains the recurring phrase ${candidate.definition.label}.`,
        isResearch: false,
      })),
      annotations: [...currentActions.values()].slice(0, 5).map((item, index) => ({
        id: `${id}:action:${index}`,
        date: item.document.publishedAt!.slice(0, 10),
        label: actionType(actionEvidenceText(item)),
        actionType: actionType(actionEvidenceText(item)),
        title: item.document.title,
        url: item.document.canonicalUrl ?? null,
      })),
      researchStatus: "not_started",
      researchCompletedAt: null,
    };
  });

  const signalById = new Map(signals.map((signal) => [signal.id, signal]));
  for (const signal of signals) {
    const candidate = candidateById.get(signal.id)!;
    const support = new Set(candidate.supporting.map((item) => item.document.id));
    signal.related = selected
      .filter((other) => signalId(other) !== signal.id)
      .map((other) => {
        const overlap = other.supporting.filter((item) => support.has(item.document.id)).length;
        const union = support.size + other.supporting.length - overlap;
        return { other, score: union ? overlap / union : 0 };
      })
      .filter((entry) => entry.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ other }) => ({
        id: signalId(other),
        kind: other.definition.kind,
        label: signalById.get(signalId(other))?.label ?? other.definition.label,
      }));
  }
  return signals;
}

export function auditDeterministicSignalQuality(
  documents: IntelligenceStoredDocument[],
  signals = buildDeterministicSignals(documents),
) {
  const eligible = documents.filter(eligibleDocument);
  const labelAudit = auditSignalLabels(signals);
  const directionCounts = Object.fromEntries(
    ["new", "rising", "sustained", "cooling"].map((direction) => [
      direction,
      signals.filter((signal) => signal.direction === direction).length,
    ]),
  );
  return {
    documents: documents.length,
    eligibleDocuments: eligible.length,
    excludedDocuments: documents.length - eligible.length,
    sourceFamilies: uniqueCount(eligible.map((document) => document.sourceFamily)),
    signals: labelAudit.total,
    meaningfulRate: labelAudit.meaningfulRate,
    blockedLabels: labelAudit.blocked,
    kindCounts: labelAudit.kindCounts,
    directionCounts,
    labels: signals.map((signal) => signal.label),
  };
}
