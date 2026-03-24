import { type ZodIssue, z } from "zod";

const sourceTypeSchema = z.enum([
  "article",
  "pdf",
  "youtube_video",
  "x_post",
  "document",
  "unknown",
]);

const reviewStatusSchema = z.enum([
  "inbox",
  "reviewed",
  "archived",
  "failed",
]);

const ingestionStatusSchema = z.enum([
  "pending",
  "ready",
  "partial",
  "failed",
]);

const captureSourceSchema = z.enum([
  "telegram",
  "import",
  "manual",
  "api",
]);

const telegramId = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, "must be an integer string"),
]);

const documentBlockSchema = z
  .object({
    source_type: sourceTypeSchema,
    original_url: z.string().trim().min(1).max(8000),
    canonical_url: z.string().trim().max(8000).nullable().optional(),
    external_id: z.string().max(512).nullable().optional(),
    title: z.string().max(2000).nullable().optional(),
    author_name: z.string().max(500).nullable().optional(),
    publisher_name: z.string().max(500).nullable().optional(),
    language: z.string().max(32).nullable().optional(),
    published_at: z.string().max(64).nullable().optional(),
    content_text: z.string().max(5_000_000).nullable().optional(),
    content_markdown: z.string().max(5_000_000).nullable().optional(),
    transcript_text: z.string().max(5_000_000).nullable().optional(),
    summary_short: z.string().max(20_000).nullable().optional(),
    content_hash: z.string().max(128).nullable().optional(),
    canonical_key: z.string().max(512).nullable().optional(),
    review_status: reviewStatusSchema.optional(),
    ingestion_status: ingestionStatusSchema.optional(),
    extraction_method: z.string().trim().min(1).max(200),
    extraction_version: z.string().max(64).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    quality_flags: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const hasBody =
      (d.content_text?.trim().length ?? 0) > 0 ||
      (d.content_markdown?.trim().length ?? 0) > 0 ||
      (d.transcript_text?.trim().length ?? 0) > 0;
    const hasSummary = (d.summary_short?.trim().length ?? 0) > 0;
    if (!hasBody && !hasSummary) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide at least one of content_text, content_markdown, transcript_text, or summary_short.",
        path: ["document"],
      });
    }
  });

const captureBlockSchema = z
  .object({
    capture_source: captureSourceSchema.optional(),
    chat_id: telegramId.optional(),
    message_id: telegramId.optional(),
    thread_id: telegramId.optional().nullable(),
    sender_id: telegramId.optional().nullable(),
    sender_label: z.string().max(500).nullable().optional(),
    raw_text: z.string().max(20_000).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .optional();

const tagsBlockSchema = z
  .object({
    user_tags: z.array(z.string().max(200)).max(200).optional(),
    leroy_tags: z
      .array(
        z
          .object({
            tag: z.string().min(1).max(200),
            confidence: z.number().min(0).max(1).nullable().optional(),
            type: z.string().max(64).nullable().optional(),
          })
          .strict(),
      )
      .max(500)
      .optional(),
  })
  .strict()
  .optional();

export const structuredIngestionBodySchema = z
  .object({
    kind: z.literal("structured"),
    document: documentBlockSchema,
    capture: captureBlockSchema,
    tags: tagsBlockSchema,
    related_urls: z.array(z.string().trim().max(8000)).max(100).optional(),
    fanout: z
      .object({
        parent_url: z.string().max(8000).nullable().optional(),
        relation: z.string().max(200).nullable().optional(),
        discovered_from: z.string().max(8000).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type StructuredIngestionBody = z.infer<typeof structuredIngestionBodySchema>;
/** Alias for clarity in v2-only call sites */
export type StructuredIngestionBodyV2 = StructuredIngestionBody;

export type StructuredParseDetail = { path: string; message: string };

export function parseStructuredIngestionBody(body: unknown):
  | { ok: true; value: StructuredIngestionBody }
  | {
      ok: false;
      message: string;
      details: StructuredParseDetail[];
      issues?: ZodIssue[];
    } {
  const r = structuredIngestionBodySchema.safeParse(body);
  if (!r.success) {
    const details: StructuredParseDetail[] = r.error.issues.map((i) => ({
      path: i.path.length ? i.path.join(".") : "body",
      message: i.message,
    }));
    const first = r.error.issues[0];
    return {
      ok: false,
      message: first
        ? `${first.path.length ? first.path.join(".") : "body"}: ${first.message}`
        : "Invalid payload",
      details,
      issues: r.error.issues,
    };
  }
  return { ok: true, value: r.data };
}
