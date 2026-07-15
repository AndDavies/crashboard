import type {
  IntelligenceSignalKind,
  IntelligenceSignalLens,
  IntelligenceSignalRange,
  IntelligenceSignalSummary,
  IntelligenceSignalsResponse,
} from "@/lib/intelligence/signals-v2-types";

export type IntelligenceRefreshKind = "daily" | "backfill" | "manual" | "test";
export type IntelligenceJobType =
  | "daily_refresh"
  | "backfill"
  | "research"
  | "topic_maintenance"
  | "collect";

export type IntelligenceStoredDocument = {
  id: string;
  externalId: string;
  sourceType: string;
  sourceFamily: string;
  title: string;
  publisher?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  canonicalUrl?: string | null;
  contentText: string;
  contentHash: string;
  editorialTokens: number;
  segmentationConfidence?: number | null;
  parserVersion?: string | null;
  raw?: Record<string, unknown>;
};

export type IntelligenceDocumentSearchResult = {
  id: string;
  title: string;
  passage: string;
  publisher: string | null;
  sourceFamily: string;
  publishedAt: string | null;
  canonicalUrl: string | null;
  whyMatched: string;
};

export type IntelligenceBrowseOptions = {
  range?: IntelligenceSignalRange;
  lens?: IntelligenceSignalLens;
  kind?: IntelligenceSignalKind | "all";
  compare?: string[];
  limit?: number;
};

export type IntelligenceValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  counts: {
    signals: number;
    documents: number;
    evidenceLinks: number;
  };
};

export type IntelligenceJob = {
  id: string;
  ownerId: string;
  jobType: IntelligenceJobType;
  status: "pending" | "leased" | "completed" | "failed" | "cancelled";
  payload: Record<string, unknown>;
  checkpoint: Record<string, unknown>;
  attempts: number;
};

export type IntelligenceResearchSource = {
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  authority: "official" | "independent" | "community";
  passage: string;
  supports: string;
};

export type IntelligenceResearchResult = {
  whatChanged: string;
  whyNow: string;
  whyItMatters: string;
  whatToWatch: string;
  assessmentChange: "strengthened" | "weakened" | "unchanged";
  evidenceStrength: "strong" | "moderate" | "early";
  sources: IntelligenceResearchSource[];
  unknowns: string[];
};

export type IntelligenceResearchRequest = {
  id: string;
  ownerId: string;
  signalId: string;
  signalLabel: string;
  question: string | null;
  status: "pending" | "running" | "completed" | "failed";
  requestedAt: string;
  completedAt: string | null;
  result: IntelligenceResearchResult | null;
  failure: string | null;
};

export type IntelligenceSourceConnection = {
  id: string;
  ownerId: string;
  sourceType: string;
  externalKey: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  credential: Record<string, unknown> | null;
  checkpoint: Record<string, unknown>;
};

export interface IntelligenceStore {
  initialize(): Promise<void>;
  health(): Promise<{
    ok: boolean;
    schemaVersion: number;
    activeRefreshId: string | null;
    activeRefreshCompletedAt: string | null;
    pendingJobs: number;
    gmailConnected: boolean;
    dailyRefreshDue: boolean;
  }>;
  beginRefresh(kind: IntelligenceRefreshKind): Promise<string>;
  putDocuments(documents: IntelligenceStoredDocument[]): Promise<void>;
  putSignals(refreshId: string, signals: IntelligenceSignalSummary[]): Promise<void>;
  validateRefresh(refreshId: string): Promise<IntelligenceValidation>;
  publishRefresh(refreshId: string): Promise<void>;
  failRefresh(refreshId: string, failure: string): Promise<void>;
  getSignals(options?: IntelligenceBrowseOptions): Promise<IntelligenceSignalsResponse>;
  getSignal(id: string): Promise<IntelligenceSignalSummary | null>;
  searchDocuments(query: string, limit?: number): Promise<IntelligenceDocumentSearchResult[]>;
  getDocument(id: string): Promise<IntelligenceStoredDocument | null>;
  listDocuments(input?: { limit?: number; before?: string | null }): Promise<IntelligenceStoredDocument[]>;
  enqueueJob(input: {
    ownerId: string;
    jobType: IntelligenceJobType;
    payload?: Record<string, unknown>;
    priority?: number;
  }): Promise<string>;
  leaseNextJob(ownerId: string, leaseOwner: string, jobType?: IntelligenceJobType): Promise<IntelligenceJob | null>;
  checkpointJob(jobId: string, checkpoint: Record<string, unknown>): Promise<void>;
  completeJob(jobId: string): Promise<void>;
  failJob(jobId: string, failure: string): Promise<void>;
  upsertSource(source: Omit<IntelligenceSourceConnection, "id"> & { id?: string }): Promise<string>;
  getSource(ownerId: string, sourceType: string, externalKey?: string): Promise<IntelligenceSourceConnection | null>;
  enqueueResearch(input: {
    ownerId: string;
    signalId: string;
    signalLabel: string;
    question?: string | null;
  }): Promise<string>;
  getResearchRequest(id: string): Promise<IntelligenceResearchRequest | null>;
  listResearchRequests(ownerId: string, limit?: number): Promise<IntelligenceResearchRequest[]>;
  markResearchRunning(id: string): Promise<void>;
  completeResearch(id: string, result: IntelligenceResearchResult): Promise<void>;
  failResearch(id: string, failure: string): Promise<void>;
  repairCanonicalOwner(ownerId: string): Promise<{
    jobsMigrated: number;
    requestsMigrated: number;
    signalIdsRepaired: number;
  }>;
}
