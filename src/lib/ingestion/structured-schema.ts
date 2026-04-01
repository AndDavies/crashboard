import { type ZodIssue, z } from "zod";

const telegramId = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, "must be an integer string"),
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

const openclawContextSchema = z
  .object({
    agent: z.string().max(200).optional(),
    orchestrator: z.string().max(200).optional(),
    channel: z.string().max(64).optional(),
    session_id: z.string().max(256).optional(),
    event_id: z.string().max(256).optional(),
  })
  .strict()
  .optional();

const telegramContextSchema = z
  .object({
    chat_id: telegramId,
    message_id: telegramId,
    thread_id: telegramId.optional().nullable(),
    sender_id: telegramId.optional().nullable(),
    sender_label: z.string().max(500).optional(),
    raw_text: z.string().max(20_000).optional(),
    topic_id: z.string().max(200).optional(),
    group_title: z.string().max(500).optional(),
  })
  .strict()
  .optional();

const entitySchema = z.union([
  z.string().trim().min(1).max(500),
  z
    .object({
      entity: z.string().trim().min(1).max(500),
    })
    .strict(),
]);

const documentSchema = z
  .object({
    url: z.string().trim().min(1).max(8000),
    source_type: sourceTypeSchema,
    title: z.string().max(2000).nullable().optional(),
    summary: z.string().max(20_000).nullable().optional(),
    content: z.string().min(1).max(5_000_000),
    keywords: z.array(z.string().trim().min(1).max(200)).max(200).optional(),
  })
  .strict();

export const structuredIngestionBodySchema = z
  .object({
    kind: z.literal("structured"),
    document: documentSchema,
    entities: z.array(entitySchema).max(500).optional(),
    embedding: z.array(z.number().finite()).max(4096).nullable().optional(),
    openclaw: openclawContextSchema,
    telegram: telegramContextSchema,
    extraction: z
      .object({
        extractor: z.string().trim().min(1).max(200),
        version: z.string().max(64).optional(),
      })
      .strict()
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type StructuredIngestionBody = z.infer<typeof structuredIngestionBodySchema>;
export type StructuredIngestionBodyV2 = StructuredIngestionBody;

export type StructuredParseDetail = { path: string; message: string };

export function parseStructuredIngestionBody(
  body: unknown,
):
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
