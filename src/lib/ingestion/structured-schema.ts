import { type ZodIssue, z } from "zod";

const telegramId = z.union([
  z.number().finite(),
  z.string().trim().regex(/^-?\d+$/, "must be an integer string"),
]);

const sourceTypeSchema = z.enum([
  "article",
  "pdf",
  "youtube_video",
  "x_post",
  "x_thread",
  "document",
  "unknown",
]);

const openclawContextSchema = z.object({
  agent: z.string().max(200).optional(),
  orchestrator: z.string().max(200).optional(),
  channel: z.string().max(64).optional(),
  session_id: z.string().max(256).optional(),
  event_id: z.string().max(256).optional(),
}).strict().optional();

const telegramContextSchema = z.object({
  chat_id: telegramId,
  message_id: telegramId,
  thread_id: telegramId.optional().nullable(),
  sender_id: telegramId.optional().nullable(),
  sender_label: z.string().max(500).optional(),
  raw_text: z.string().max(20_000).optional(),
  topic_id: z.string().max(200).optional(),
  group_title: z.string().max(500).optional(),
}).strict().optional();

const entitySchema = z.union([
  z.string().trim().min(1).max(500),
  z.object({ entity: z.string().trim().min(1).max(500) }).strict(),
]);

/**
 * OpenClaw has shipped two structured-document contracts. Keeping their fields
 * in one validated envelope lets old agents continue to send rich capture/tag
 * payloads while the current, smaller url/content contract remains unchanged.
 */
const documentSchema = z.object({
  source_type: sourceTypeSchema,

  // Current document graph contract.
  url: z.string().trim().min(1).max(8000).optional(),
  summary: z.string().max(20_000).nullable().optional(),
  content: z.string().min(1).max(5_000_000).optional(),
  keywords: z.array(z.string().trim().min(1).max(200)).max(200).optional(),

  // Rich capture contract retained for backwards compatibility.
  original_url: z.string().trim().min(1).max(8000).optional(),
  canonical_url: z.string().trim().min(1).max(8000).nullable().optional(),
  canonical_key: z.string().trim().min(1).max(8000).nullable().optional(),
  external_id: z.string().trim().min(1).max(1000).nullable().optional(),
  author_name: z.string().max(1000).nullable().optional(),
  publisher_name: z.string().max(1000).nullable().optional(),
  language: z.string().max(64).nullable().optional(),
  published_at: z.string().max(100).nullable().optional(),
  content_text: z.string().max(5_000_000).nullable().optional(),
  content_markdown: z.string().max(5_000_000).nullable().optional(),
  transcript_text: z.string().max(5_000_000).nullable().optional(),
  summary_short: z.string().max(20_000).nullable().optional(),
  extraction_method: z.string().trim().min(1).max(200).optional(),
  extraction_version: z.string().max(64).nullable().optional(),
  ingestion_status: z.enum(["pending", "ready", "failed"]).optional(),
  review_status: z.enum(["inbox", "reviewed", "archived"]).optional(),
  content_hash: z.string().max(256).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  quality_flags: z.record(z.string(), z.unknown()).optional(),

  title: z.string().max(2000).nullable().optional(),
}).strict().superRefine((document, context) => {
  const current = Boolean(document.url && document.content);
  const richContent = document.content_text ?? document.content_markdown ??
    document.transcript_text ?? document.summary_short;
  const legacy = Boolean(document.original_url && document.extraction_method && richContent?.trim());
  if (current || legacy) return;
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ["content_text"],
    message: "provide url and content, or original_url, extraction_method, and content_text/summary/transcript/markdown",
  });
});

const captureSchema = z.object({
  capture_source: z.enum(["telegram", "import", "manual", "api"]),
  chat_id: telegramId.optional().nullable(),
  message_id: telegramId.optional().nullable(),
  thread_id: telegramId.optional().nullable(),
  sender_id: telegramId.optional().nullable(),
  sender_label: z.string().max(500).optional(),
  raw_text: z.string().max(20_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().optional();

const tagsSchema = z.object({
  user_tags: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
  leroy_tags: z.array(z.object({
    tag: z.string().trim().min(1).max(200),
    confidence: z.number().min(0).max(1).optional(),
    type: z.string().max(100).optional(),
  }).strict()).max(200).optional(),
}).strict().optional();

const fanoutSchema = z.object({
  parent_url: z.string().trim().min(1).max(8000).optional(),
  relation: z.string().trim().min(1).max(100),
  discovered_from: z.string().trim().min(1).max(8000).optional(),
}).strict().optional();

export const structuredIngestionBodySchema = z.object({
  kind: z.literal("structured"),
  document: documentSchema,
  entities: z.array(entitySchema).max(500).optional(),
  embedding: z.array(z.number().finite()).max(4096).nullable().optional(),
  openclaw: openclawContextSchema,
  telegram: telegramContextSchema,
  extraction: z.object({
    extractor: z.string().trim().min(1).max(200),
    version: z.string().max(64).optional(),
  }).strict().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  capture: captureSchema,
  tags: tagsSchema,
  related_urls: z.array(z.string().trim().min(1).max(8000)).max(200).optional(),
  fanout: fanoutSchema,
}).strict();

export type StructuredIngestionBody = z.infer<typeof structuredIngestionBodySchema>;
export type StructuredIngestionBodyV2 = StructuredIngestionBody;
export type StructuredParseDetail = { path: string; message: string };

export function parseStructuredIngestionBody(body: unknown):
  | { ok: true; value: StructuredIngestionBody }
  | { ok: false; message: string; details: StructuredParseDetail[]; issues?: ZodIssue[] } {
  const result = structuredIngestionBodySchema.safeParse(body);
  if (result.success) return { ok: true, value: result.data };
  const details = result.error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join(".") : "body",
    message: issue.message,
  }));
  const first = result.error.issues[0];
  return {
    ok: false,
    message: first
      ? `${first.path.length ? first.path.join(".") : "body"}: ${first.message}`
      : "Invalid payload",
    details,
    issues: result.error.issues,
  };
}
