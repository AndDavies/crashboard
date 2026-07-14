import { z } from "zod";

const SignalKindSchema = z.enum(["topic", "keyword", "organization", "system", "programme"]);
const LensSchema = z.enum(["all", "defence", "ai", "cyber", "canada-allies"]);

export const IntelligenceWorkBundleSchema = z.object({
  schemaVersion: z.literal("crashboard-intelligence-work-bundle.v1"),
  jobId: z.string().min(1),
  jobType: z.enum(["daily_refresh", "backfill", "research", "topic_maintenance", "collect"]),
  jobPayload: z.record(z.string(), z.unknown()),
  refreshId: z.string().uuid(),
  generatedAt: z.iso.datetime(),
  instructions: z.array(z.string()).min(1),
  documents: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    sourceFamily: z.string(),
    publishedAt: z.string().nullable(),
    canonicalUrl: z.string().nullable(),
    contentText: z.string(),
  })).min(1).max(100),
  existingSignals: z.array(z.object({
    id: z.string(),
    kind: SignalKindSchema,
    label: z.string(),
    aliases: z.array(z.string()),
  })),
}).strict();

export const IntelligenceSignalSummarySchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  kind: SignalKindSchema,
  label: z.string().min(1),
  direction: z.enum(["new", "rising", "sustained", "cooling"]),
  evidenceStrength: z.enum(["strong", "moderate", "early"]),
  currentReach: z.number().min(0).max(1),
  previousReach: z.number().min(0).max(1),
  changePoints: z.number(),
  currentItems: z.number().int().nonnegative(),
  previousItems: z.number().int().nonnegative(),
  stories: z.number().int().nonnegative(),
  sources: z.number().int().nonnegative(),
  actions: z.number().int().nonnegative(),
  momentum: z.number(),
  acceleration: z.number(),
  burst: z.number(),
  persistenceWeeks: z.number().int().nonnegative(),
  novelty: z.number().min(0).max(1),
  whyNow: z.string().min(1),
  whyItMatters: z.string().min(1),
  whatToWatch: z.string().min(1),
  lensKeys: z.array(LensSchema).min(1),
  series: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    shareOfCoverage: z.number().min(0).max(1),
    items: z.number().int().nonnegative(),
    stories: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    actions: z.number().int().nonnegative(),
    mentionsPer10k: z.number().nonnegative(),
  })).min(1),
  related: z.array(z.object({ id: z.string(), kind: SignalKindSchema, label: z.string() })),
  evidence: z.array(z.object({
    id: z.string(),
    documentId: z.string(),
    title: z.string(),
    passage: z.string(),
    url: z.string().nullable(),
    publisher: z.string().nullable(),
    publishedAt: z.string().nullable(),
    sourceFamily: z.string().nullable(),
    authority: z.string().nullable(),
    storyId: z.string().nullable(),
    whyMatched: z.string(),
    isResearch: z.boolean(),
  })),
  annotations: z.array(z.object({
    id: z.string(), date: z.string(), label: z.string(), actionType: z.string(),
    title: z.string(), url: z.string().nullable(),
  })),
  researchStatus: z.enum(["not_started", "queued", "running", "completed", "failed"]),
  researchCompletedAt: z.string().nullable(),
}).strict();

export const IntelligenceAnalysisOutputSchema = z.object({
  schemaVersion: z.literal("crashboard-intelligence-analysis.v1"),
  jobId: z.string().min(1),
  refreshId: z.string().uuid(),
  analyzedAt: z.iso.datetime(),
  signals: z.array(IntelligenceSignalSummarySchema).min(1).max(250),
  reviewedDocumentIds: z.array(z.string()),
  warnings: z.array(z.string()),
}).strict();

export type IntelligenceWorkBundle = z.infer<typeof IntelligenceWorkBundleSchema>;
export type IntelligenceAnalysisOutput = z.infer<typeof IntelligenceAnalysisOutputSchema>;
