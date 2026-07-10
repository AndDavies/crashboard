export const INTELLIGENCE_SOURCE_TYPES = [
  "email_newsletter",
  "web_article",
  "official_release",
  "procurement_notice",
  "youtube_video",
  "podcast_episode",
  "reddit_post",
  "social_post",
] as const;

export type IntelligenceSourceType = (typeof INTELLIGENCE_SOURCE_TYPES)[number];

export const INTELLIGENCE_EVENT_TYPES = [
  "procurement_notice",
  "rfi_rfp_challenge",
  "award",
  "funding_investment",
  "partnership",
  "acquisition",
  "development",
  "trial_pilot",
  "deployment",
  "policy_regulation",
  "capacity_expansion",
  "cancellation",
  "other",
] as const;

export type IntelligenceEventType = (typeof INTELLIGENCE_EVENT_TYPES)[number];

export const INTELLIGENCE_ENTITY_TYPES = [
  "organization",
  "government_agency",
  "program",
  "product_system",
  "capability_technology",
  "sector",
  "geography",
  "alliance",
  "person",
] as const;

export type IntelligenceEntityType = (typeof INTELLIGENCE_ENTITY_TYPES)[number];

export type IntelligenceDocumentEnvelope = {
  ownerId: string;
  sourceType: IntelligenceSourceType;
  externalId: string;
  originalUrl: string;
  canonicalUrl?: string | null;
  title?: string | null;
  authorName?: string | null;
  publisherName?: string | null;
  language?: string | null;
  publishedAt?: string | null;
  contentText: string;
  summaryShort?: string | null;
  sourceChannel?: string | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
};

export type IntelligenceExtractedEntity = {
  name: string;
  entityType: IntelligenceEntityType;
  role: string;
  countryCode: string;
  aliases: string[];
  confidence: number;
  evidenceText: string;
};

export type IntelligenceExtractedEvent = {
  eventType: IntelligenceEventType;
  lifecycleStatus:
    | "rumored"
    | "announced"
    | "open"
    | "awarded"
    | "in_development"
    | "in_trial"
    | "deployed"
    | "completed"
    | "cancelled"
    | "unknown";
  title: string;
  summary: string;
  occurredAt: string;
  announcedAt: string;
  closesAt: string;
  amount: number;
  currency: string;
  geography: string;
  countryCode: string;
  defenceRelevance: boolean;
  canadaAlliedRelevance: boolean;
  confidence: number;
  evidenceQuality: number;
  evidenceText: string;
  entities: IntelligenceExtractedEntity[];
  themes: string[];
};

export type IntelligenceExtraction = {
  documentSummary: string;
  primaryDomain: string;
  themes: string[];
  noveltySignals: string[];
  events: IntelligenceExtractedEvent[];
  entities: IntelligenceExtractedEntity[];
  qualityFlags: string[];
};

export type TrendMetricInput = {
  currentEventRate: number;
  baselineEventRate: number;
  independentSourceCount: number;
  activeWeeks: number;
  evidenceConfidence: number;
};

export type TrendMetricResult = {
  momentum: number;
  sourceDiversity: number;
  persistence: number;
  evidenceConfidence: number;
  trendStrength: number;
};

export type SourceDiscoveryPage = {
  externalIds: string[];
  nextCheckpoint: Record<string, unknown> | null;
};

export interface IntelligenceSourceAdapter {
  discover(input: {
    ownerId: string;
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage>;
  fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope>;
}

export type IntelligenceDashboardData = {
  status: "ready" | "schema_missing" | "configuration_missing";
  generatedAt: string;
  configuration: {
    gmailConnected: boolean;
    gmailOAuthConfigured: boolean;
    tokenEncryptionConfigured: boolean;
    openaiConfigured: boolean;
  };
  coverage: {
    documentCount: number;
    eventCount: number;
    sourceCount: number;
    failedCount: number;
    lastSyncedAt: string | null;
  };
  trends: Array<{
    key: string;
    label: string;
    domain: string;
    strength: number;
    momentum: number;
    eventCount: number;
    sourceCount: number;
    novelty: boolean;
  }>;
  trendSeries: Array<{
    period: string;
    eventRate: number;
    mentionRate: number;
  }>;
  events: Array<{
    id: string;
    title: string;
    eventType: IntelligenceEventType;
    lifecycleStatus: string;
    summary: string;
    announcedAt: string | null;
    amount: number | null;
    currency: string | null;
    geography: string | null;
    defenceRelevance: boolean;
    canadaAlliedRelevance: boolean;
    confidence: number;
    evidenceCount: number;
  }>;
  sourceMix: Array<{ label: string; count: number }>;
  eventMix: Array<{ label: string; count: number }>;
  recentRuns: Array<{
    id: string;
    runType: string;
    status: string;
    processedCount: number;
    failedCount: number;
    createdAt: string;
  }>;
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    summary: string;
    createdAt: string;
  }>;
};
