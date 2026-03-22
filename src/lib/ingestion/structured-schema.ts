import { type ZodIssue, z } from "zod";
import type { ArtifactType, ContentKind, SourceType } from "@/lib/ingestion/types";

const sourceTypeSchema = z.enum([
  "article",
  "pdf",
  "youtube_video",
  "x_post",
  "x_thread",
  "document",
  "unknown",
]) as z.ZodType<SourceType>;

const contentKindSchema = z.enum([
  "primary",
  "transcript",
  "description",
  "ocr",
  "structured",
  "auxiliary",
]) as z.ZodType<ContentKind>;

const artifactTypeStructuredSchema = z.enum([
  "downloaded_pdf",
  "transcript_file",
  "raw_html",
  "html_snapshot",
  "attachment",
  "other",
  "uploaded_pdf",
  "thumbnail",
  "screenshot",
]) as z.ZodType<ArtifactType>;

const telegramId = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, "must be an integer string"),
]);

const openclawProvenanceSchema = z
  .object({
    agent: z.string().max(200).nullable().optional(),
    orchestrator: z.string().max(200).nullable().optional(),
    channel: z.string().max(64).nullable().optional(),
    session_id: z.string().max(256).nullable().optional(),
    event_id: z.string().max(256).nullable().optional(),
    /** e.g. "leroy" */
    extracted_by: z.string().max(120).nullable().optional(),
  })
  .strict()
  .optional();

const telegramProvenanceSchema = z
  .object({
    chat_id: telegramId,
    message_id: telegramId,
    thread_id: telegramId.optional().nullable(),
    sender_id: telegramId.optional().nullable(),
    sender_label: z.string().max(500).nullable().optional(),
    raw_text: z.string().max(20_000).nullable().optional(),
    topic_id: z.union([z.string().max(200), telegramId]).nullable().optional(),
    group_title: z.string().max(500).nullable().optional(),
  })
  .strict();

const provenanceSchema = z
  .object({
    origin: z.string().max(64).optional(),
    telegram: telegramProvenanceSchema.optional(),
    openclaw: openclawProvenanceSchema,
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .optional();

const sourceBlockSchema = z
  .object({
    source_type: sourceTypeSchema,
    original_url: z.string().trim().min(1).max(8000),
    canonical_url: z.string().trim().max(8000).nullable().optional(),
    title: z.string().max(500).nullable().optional(),
    author_name: z.string().max(500).nullable().optional(),
    publisher_name: z.string().max(500).nullable().optional(),
    language: z.string().max(32).nullable().optional(),
    published_at: z.string().max(64).nullable().optional(),
    content_hash: z.string().max(128).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const contentBlockSchema = z
  .object({
    content_kind: contentKindSchema.optional(),
    raw_text: z.string().max(5_000_000).nullable().optional(),
    normalized_text: z.string().max(5_000_000).nullable().optional(),
    html: z.string().max(5_000_000).nullable().optional(),
    markdown: z.string().max(5_000_000).nullable().optional(),
    transcript_text: z.string().max(5_000_000).nullable().optional(),
    extraction_method: z.string().trim().min(1).max(200),
    extraction_version: z.string().max(64).optional(),
    quality_flags: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const has =
      (c.normalized_text && c.normalized_text.trim().length > 0) ||
      (c.raw_text && c.raw_text.trim().length > 0) ||
      (c.html && c.html.trim().length > 0) ||
      (c.markdown && c.markdown.trim().length > 0) ||
      (c.transcript_text && c.transcript_text.trim().length > 0);
    if (!has) {
      ctx.addIssue({
        code: "custom",
        message:
          "At least one of normalized_text, raw_text, html, markdown, or transcript_text must be non-empty.",
      });
    }
  });

const artifactItemSchema = z
  .object({
    artifact_type: artifactTypeStructuredSchema,
    storage_path: z.string().trim().min(1).max(2000),
    mime_type: z.string().max(200).nullable().optional(),
    byte_size: z.number().int().nonnegative().nullable().optional(),
    checksum: z.string().max(128).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const entityItemSchema = z
  .object({
    label: z.string().trim().min(1).max(500),
    entity_type: z.string().max(120).optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    role: z.string().max(120).nullable().optional(),
    span_start: z.number().int().nullable().optional(),
    span_end: z.number().int().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const structuredIngestionBodySchema = z
  .object({
    kind: z.literal("structured"),
    source: sourceBlockSchema,
    content: contentBlockSchema,
    artifacts: z.array(artifactItemSchema).max(50).optional(),
    entities: z.array(entityItemSchema).max(200).optional(),
    provenance: provenanceSchema,
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

export function parseStructuredIngestionBody(
  body: unknown,
):
  | { ok: true; value: StructuredIngestionBody }
  | { ok: false; message: string; issues?: ZodIssue[] } {
  const r = structuredIngestionBodySchema.safeParse(body);
  if (!r.success) {
    const first = r.error.issues[0];
    return {
      ok: false,
      message: first
        ? `${first.path.join(".") || "body"}: ${first.message}`
        : "Invalid request body.",
      issues: r.error.issues,
    };
  }
  return { ok: true, value: r.data };
}
