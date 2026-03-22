import { type ZodIssue, z } from "zod";

const telegramId = z.union([
  z.number().finite(),
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, "must be an integer string"),
]);

export const openclawContextSchema = z
  .object({
    agent: z.string().max(200).optional(),
    orchestrator: z.string().max(200).optional(),
    channel: z.string().max(64).optional(),
    session_id: z.string().max(256).optional(),
    event_id: z.string().max(256).optional(),
  })
  .strict()
  .optional();

export const telegramContextSchema = z
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
  .strict();

export const openclawIngestionBodySchema = z
  .object({
    kind: z.literal("url"),
    url: z.string().trim().min(1).max(8000),
    title: z.string().max(500).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    openclaw: openclawContextSchema,
    telegram: telegramContextSchema,
  })
  .strict();

export type OpenclawIngestionBody = z.infer<typeof openclawIngestionBodySchema>;

export function parseOpenclawIngestionBody(
  body: unknown,
):
  | { ok: true; value: OpenclawIngestionBody }
  | { ok: false; message: string; issues?: ZodIssue[] } {
  const r = openclawIngestionBodySchema.safeParse(body);
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
