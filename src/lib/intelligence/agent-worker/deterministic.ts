import { createHash } from "node:crypto";
import type { IntelligenceSignalSummary } from "@/lib/intelligence/signals-v2-types";
import type { IntelligenceStoredDocument } from "@/lib/intelligence/store";

const DAY_MS = 86_400_000;
const STOPWORDS = new Set(`a an and are as at be been being but by can could did do does for from had has have he her here him his how i if in into is it its may more most not of on or our out over she should so some than that the their them then there these they this those through to under up us was we were what when where which who why will with would you your after also announced company companies defence defense industry market new news newsletter said says source sources system systems today week year years`.split(/\s+/u));

function key(value: string) {
  return value.toLocaleLowerCase().replace(/[’']/gu, "").replace(/[^a-z0-9-]+/gu, " ").trim();
}

function weekStart(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function terms(content: string) {
  const counts = new Map<string, number>();
  for (const match of content.matchAll(/\b(?:[A-Z0-9]+(?:-[A-Z0-9]+)+|[A-Za-z][A-Za-z0-9-]{2,})\b/gu)) {
    const normalized = key(match[0]);
    if (!normalized || STOPWORDS.has(normalized) || /^\d+$/u.test(normalized)) continue;
    counts.set(normalized, Math.min(5, (counts.get(normalized) ?? 0) + 1));
  }
  return counts;
}

function lenses(term: string) {
  const output: Array<"all" | "defence" | "ai" | "cyber" | "canada-allies"> = ["all"];
  if (/defen|military|army|navy|air force|missile|uas|drone|weapon|nato|procurement/u.test(term)) output.push("defence");
  if (/\bai\b|artificial|model|machine|autonom|robot|compute|semiconductor/u.test(term)) output.push("ai");
  if (/cyber|ransom|malware|security|zero trust|vulnerab/u.test(term)) output.push("cyber");
  if (/canad|nato|allied|norad|five eyes/u.test(term)) output.push("canada-allies");
  return output;
}

function strength(items: number, sources: number) {
  return items >= 5 && sources >= 3 ? "strong" as const : items >= 3 && sources >= 2 ? "moderate" as const : "early" as const;
}

export function buildDeterministicSignals(documents: IntelligenceStoredDocument[]): IntelligenceSignalSummary[] {
  const usable = documents.filter((document) => document.publishedAt && Number.isFinite(Date.parse(document.publishedAt)));
  if (!usable.length) return [];
  const latest = Math.max(...usable.map((document) => Date.parse(document.publishedAt!)));
  const currentStart = latest - 27 * DAY_MS;
  const previousStart = currentStart - 28 * DAY_MS;
  const documentTerms = new Map(usable.map((document) => [document.id, terms(`${document.title}\n${document.contentText}`)]));
  const termDocuments = new Map<string, IntelligenceStoredDocument[]>();
  for (const document of usable) {
    for (const term of documentTerms.get(document.id)?.keys() ?? []) {
      const supporting = termDocuments.get(term) ?? [];
      supporting.push(document);
      termDocuments.set(term, supporting);
    }
  }
  const currentEligible = usable.filter((document) => Date.parse(document.publishedAt!) >= currentStart);
  const previousEligible = usable.filter((document) => {
    const date = Date.parse(document.publishedAt!);
    return date >= previousStart && date < currentStart;
  });
  const weeks = new Map<string, IntelligenceStoredDocument[]>();
  for (const document of usable) {
    const week = weekStart(document.publishedAt!);
    const eligible = weeks.get(week) ?? [];
    eligible.push(document);
    weeks.set(week, eligible);
  }
  const orderedWeeks = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
  const candidates = [...termDocuments.entries()].map(([term, supporting]) => {
    const current = supporting.filter((document) => Date.parse(document.publishedAt!) >= currentStart);
    const previous = supporting.filter((document) => {
      const date = Date.parse(document.publishedAt!);
      return date >= previousStart && date < currentStart;
    });
    const currentReach = current.length / Math.max(1, currentEligible.length);
    const previousReach = previous.length / Math.max(1, previousEligible.length);
    const sources = new Set(current.map((document) => document.sourceFamily)).size;
    return { term, supporting, current, previous, currentReach, previousReach, sources };
  }).filter((candidate) => candidate.current.length >= 2 || candidate.supporting.length >= 4)
    .sort((a, b) => (b.currentReach - b.previousReach) - (a.currentReach - a.previousReach) || b.current.length - a.current.length)
    .slice(0, 40);

  return candidates.map((candidate) => {
    const series = orderedWeeks.map(([date, eligible]) => {
      const supporting = eligible.filter((document) => documentTerms.get(document.id)?.has(candidate.term));
      const mentions = supporting.reduce((sum, document) => sum + (documentTerms.get(document.id)?.get(candidate.term) ?? 0), 0);
      const tokens = eligible.reduce((sum, document) => sum + document.editorialTokens, 0);
      return {
        date,
        shareOfCoverage: supporting.length / Math.max(1, eligible.length),
        items: supporting.length,
        stories: supporting.length,
        sources: new Set(supporting.map((document) => document.sourceFamily)).size,
        actions: 0,
        mentionsPer10k: tokens ? (mentions * 10_000) / tokens : 0,
      };
    });
    const change = candidate.currentReach - candidate.previousReach;
    const direction = candidate.previous.length <= 1 && candidate.current.length >= 3
      ? "new" as const
      : change >= 0.005 && candidate.currentReach >= candidate.previousReach * 1.5
        ? "rising" as const
        : change <= -0.005
          ? "cooling" as const
          : "sustained" as const;
    const id = createHash("sha256").update(`keyword:${candidate.term}`).digest("hex").slice(0, 24);
    const label = candidate.term.replace(/\b\w/gu, (letter) => letter.toLocaleUpperCase());
    const sourceNames = [...new Set(candidate.current.map((document) => document.sourceFamily))];
    return {
      id,
      key: `keyword:${id}`,
      kind: "keyword",
      label,
      direction,
      evidenceStrength: strength(candidate.current.length, candidate.sources),
      currentReach: candidate.currentReach,
      previousReach: candidate.previousReach,
      changePoints: change * 100,
      currentItems: candidate.current.length,
      previousItems: candidate.previous.length,
      stories: candidate.current.length,
      sources: candidate.sources,
      actions: 0,
      momentum: candidate.previousReach ? candidate.currentReach / candidate.previousReach : candidate.currentReach ? 2 : 0,
      acceleration: series.length >= 3 ? series.at(-1)!.shareOfCoverage - series.at(-2)!.shareOfCoverage : 0,
      burst: Math.max(0, change),
      persistenceWeeks: series.filter((point) => point.items > 0).slice(-4).length,
      novelty: candidate.previous.length <= 1 ? 1 : 0,
      whyNow: `${label} appears in ${(candidate.currentReach * 100).toFixed(1)}% of current coverage, compared with ${(candidate.previousReach * 100).toFixed(1)}% previously, across ${candidate.sources} source ${candidate.sources === 1 ? "family" : "families"}.`,
      whyItMatters: `The movement is visible across ${sourceNames.slice(0, 3).join(", ") || "retained sources"}. Codex review should connect it to concrete announcements before treating cause as known.`,
      whatToWatch: `Watch for named buyers, funding, contracts, trials, deployments, or policy changes tied to ${label}.`,
      lensKeys: lenses(candidate.term),
      series,
      related: [],
      evidence: candidate.current.slice(0, 5).map((document, index) => ({
        id: `${id}:${index}`,
        documentId: document.id,
        title: document.title,
        passage: document.contentText.slice(0, 600),
        url: document.canonicalUrl ?? null,
        publisher: document.publisher ?? null,
        publishedAt: document.publishedAt ?? null,
        sourceFamily: document.sourceFamily,
        authority: "retained source",
        storyId: null,
        whyMatched: `Contains the tracked term ${label}.`,
        isResearch: false,
      })),
      annotations: [],
      researchStatus: "not_started",
      researchCompletedAt: null,
    };
  });
}
