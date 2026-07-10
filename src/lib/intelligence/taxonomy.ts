import type { IntelligenceEventType } from "@/lib/intelligence/types";

export const EVENT_TYPE_LABELS: Record<IntelligenceEventType, string> = {
  procurement_notice: "Procurement notice",
  rfi_rfp_challenge: "RFI / RFP / challenge",
  award: "Award",
  funding_investment: "Funding / investment",
  partnership: "Partnership",
  acquisition: "Acquisition",
  development: "Development",
  trial_pilot: "Trial / pilot",
  deployment: "Deployment",
  policy_regulation: "Policy / regulation",
  capacity_expansion: "Capacity expansion",
  cancellation: "Cancellation",
  other: "Other material event",
};

export const DEFENCE_TERMS = [
  "defence",
  "defense",
  "military",
  "armed forces",
  "nato",
  "norad",
  "five eyes",
  "dual-use",
  "procurement",
  "rfi",
  "rfp",
  "challenge",
  "trial",
  "pilot",
  "capability",
  "autonomy",
  "drone",
  "uncrewed",
  "radar",
  "electronic warfare",
  "shipbuilding",
  "aerospace",
] as const;

const EVENT_PATTERNS: Array<[IntelligenceEventType, RegExp]> = [
  ["rfi_rfp_challenge", /\b(rfi|request for information|rfp|request for proposal|challenge call)\b/iu],
  ["procurement_notice", /\b(procurement|tender|solicitation|bid notice)\b/iu],
  ["award", /\b(contract award|awarded|selected bidder|wins? (?:a )?contract)\b/iu],
  ["funding_investment", /\b(funding|fundraise|financing|investment|grant|capital raise)\b/iu],
  ["trial_pilot", /\b(trial|pilot programme|pilot program|demonstration|field test)\b/iu],
  ["deployment", /\b(deploy(?:ed|ment)?|entered service|operational use)\b/iu],
  ["development", /\b(develop(?:ed|ment|ing)?|prototype|research programme|research program)\b/iu],
  ["capacity_expansion", /\b(factory|facility|production line|capacity expansion|new plant)\b/iu],
  ["policy_regulation", /\b(policy|regulation|legislation|strategy released|framework)\b/iu],
  ["partnership", /\b(partnership|memorandum of understanding|\bmou\b|joint venture)\b/iu],
  ["acquisition", /\b(acquisition|acquires|merger|takeover)\b/iu],
  ["cancellation", /\b(cancelled|canceled|terminated|withdrawn|suspended)\b/iu],
];

export function classifyCandidateEventTypes(text: string): IntelligenceEventType[] {
  return EVENT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([type]) => type);
}

export function hasDefenceRelevance(text: string) {
  const normalized = text.toLowerCase();
  return DEFENCE_TERMS.some((term) => normalized.includes(term));
}

export function normalizedEntityName(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|llc|plc|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
