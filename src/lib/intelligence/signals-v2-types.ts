export const INTELLIGENCE_SIGNAL_RANGES = ["30d", "90d", "180d", "365d"] as const;
export type IntelligenceSignalRange = (typeof INTELLIGENCE_SIGNAL_RANGES)[number];

export const INTELLIGENCE_SIGNAL_LENSES = [
  "all",
  "defence",
  "ai",
  "cyber",
  "canada-allies",
] as const;
export type IntelligenceSignalLens = (typeof INTELLIGENCE_SIGNAL_LENSES)[number];

export const INTELLIGENCE_SIGNAL_KINDS = [
  "topic",
  "keyword",
  "organization",
  "system",
  "programme",
] as const;
export type IntelligenceSignalKind = (typeof INTELLIGENCE_SIGNAL_KINDS)[number];

export type IntelligenceSignalDirection = "new" | "rising" | "sustained" | "cooling";
export type IntelligenceEvidenceStrength = "strong" | "moderate" | "early";

export type IntelligenceSignalSeriesPoint = {
  date: string;
  shareOfCoverage: number;
  items: number;
  stories: number;
  sources: number;
  actions: number;
  mentionsPer10k: number;
};

export type IntelligenceSignalEvidence = {
  id: string;
  documentId: string;
  title: string;
  passage: string;
  url: string | null;
  publisher: string | null;
  publishedAt: string | null;
  sourceFamily: string | null;
  authority: string | null;
  storyId: string | null;
  whyMatched: string;
  isResearch: boolean;
};

export type IntelligenceSignalAnnotation = {
  id: string;
  date: string;
  label: string;
  actionType: string;
  title: string;
  url: string | null;
};

export type IntelligenceSignalSummary = {
  id: string;
  key: string;
  kind: IntelligenceSignalKind;
  label: string;
  direction: IntelligenceSignalDirection;
  evidenceStrength: IntelligenceEvidenceStrength;
  currentReach: number;
  previousReach: number;
  changePoints: number;
  currentItems: number;
  previousItems: number;
  stories: number;
  sources: number;
  actions: number;
  momentum: number;
  acceleration: number;
  burst: number;
  persistenceWeeks: number;
  novelty: number;
  whyNow: string;
  whyItMatters: string;
  whatToWatch: string;
  lensKeys: IntelligenceSignalLens[];
  series: IntelligenceSignalSeriesPoint[];
  related: Array<{ id: string; kind: IntelligenceSignalKind; label: string }>;
  evidence: IntelligenceSignalEvidence[];
  annotations: IntelligenceSignalAnnotation[];
  researchStatus: "not_started" | "queued" | "running" | "completed" | "failed";
  researchCompletedAt: string | null;
};

export type IntelligenceSignalsResponse = {
  generatedAt: string;
  completeThrough: string;
  range: IntelligenceSignalRange;
  lens: IntelligenceSignalLens;
  kind: IntelligenceSignalKind | "all";
  total: number;
  signals: IntelligenceSignalSummary[];
  comparison: IntelligenceSignalSummary[];
  dataStatus: "ready" | "stale" | "disabled" | "building" | "schema_missing";
};
