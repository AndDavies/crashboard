import {
  INGESTION_ORIGIN_TELEGRAM,
  TRIGGER_OPENCLAW_TELEGRAM_URL,
} from "@/lib/ingestion/constants";
import {
  createIngestionRepository,
  mergeIngestionEventMetadata,
} from "@/lib/ingestion/repository";
import { runIngestion } from "@/lib/ingestion/service";
import type {
  IngestionServiceError,
  IngestionServiceResult,
} from "@/lib/ingestion/types";
import type { OpenclawIngestionBody } from "@/lib/openclaw/ingestion/schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OpenclawIngestionSuccess {
  ok: true;
  deduped: boolean;
  eventId: string;
  /** Present when this request ran ingestion (not a deduped replay). */
  job?: IngestionServiceResult["job"];
  source?: IngestionServiceResult["source"];
  content?: IngestionServiceResult["content"];
  artifact?: IngestionServiceResult["artifact"];
  summary?: string;
  message?: string;
  /** Set on dedupe: IDs already stored on the provenance row (no re-run). */
  existingIngestionJobId?: string | null;
  existingSourceId?: string | null;
}

function jobIdFromOutcome(
  o: IngestionServiceResult | IngestionServiceError,
): string | undefined {
  if (o.ok) return o.job.id;
  const id = o.details?.jobId;
  return typeof id === "string" ? id : undefined;
}

function threadKeyPart(
  threadId: number | string | null | undefined,
): string {
  if (threadId === null || threadId === undefined) return "0";
  return String(threadId);
}

function buildOpenclawTriggerReference(
  chatId: number | string,
  threadId: number | string | null | undefined,
  messageId: number | string,
): string {
  return `openclaw:telegram:${String(chatId)}:${threadKeyPart(threadId)}:${String(messageId)}`;
}

function compactOpenclawRecord(
  o: OpenclawIngestionBody["openclaw"],
): Record<string, string> {
  const out: Record<string, string> = {};
  if (o) {
    if (o.agent !== undefined) out.agent = o.agent;
    if (o.orchestrator !== undefined) out.orchestrator = o.orchestrator;
    if (o.channel !== undefined) out.channel = o.channel;
    if (o.session_id !== undefined) out.session_id = o.session_id;
    if (o.event_id !== undefined) out.event_id = o.event_id;
  }
  if (out.orchestrator === undefined) out.orchestrator = "openclaw";
  if (out.channel === undefined) out.channel = "telegram";
  return out;
}

function compactTelegramForSource(
  t: OpenclawIngestionBody["telegram"],
): Record<string, unknown> {
  return {
    chat_id: t.chat_id,
    message_id: t.message_id,
    thread_id: t.thread_id ?? null,
  };
}

/**
 * Idempotent OpenClaw → Crashboard URL ingestion for a Telegram message identity.
 * Shares the same `ingestion_events` uniqueness as the native Telegram webhook path.
 */
export async function orchestrateOpenclawTelegramUrlIngestion(
  body: OpenclawIngestionBody,
  admin: SupabaseClient,
): Promise<OpenclawIngestionSuccess | IngestionServiceError> {
  const t = body.telegram;
  const threadId = t.thread_id ?? null;
  const chatId = t.chat_id;
  const messageId = t.message_id;

  const repo = createIngestionRepository(admin);

  const eventMetadata = {
    phase1d: true,
    pathway: "openclaw",
    openclaw: compactOpenclawRecord(body.openclaw),
    telegram: {
      chat_id: chatId,
      message_id: messageId,
      thread_id: threadId,
      ...(t.topic_id !== undefined ? { topic_id: t.topic_id } : {}),
      ...(t.group_title !== undefined ? { group_title: t.group_title } : {}),
    },
  };

  const inserted = await repo.tryInsertTelegramIngestionEvent({
    chat_id: chatId,
    thread_id: threadId,
    message_id: messageId,
    sender_id: t.sender_id ?? null,
    sender_label: t.sender_label?.trim() || null,
    raw_text: t.raw_text?.trim() || null,
    attachments: [],
    metadata: eventMetadata,
  });

  if (!inserted) {
    const existing = await repo.findTelegramEventByMessageKey({
      chatId,
      threadId,
      messageId,
    });
    if (!existing) {
      return {
        ok: false,
        code: "internal",
        message: "Dedupe race: could not load existing ingestion event.",
        httpStatus: 409,
      };
    }
    return {
      ok: true,
      deduped: true,
      eventId: existing.id,
      existingIngestionJobId: existing.ingestion_job_id,
      existingSourceId: existing.source_id,
      message:
        "This Telegram message was already recorded; ingestion was not re-run.",
    };
  }

  const triggerReference = buildOpenclawTriggerReference(
    chatId,
    threadId,
    messageId,
  );

  const sourceMetadata = {
    ingested_via: "openclaw" as const,
    openclaw: compactOpenclawRecord(body.openclaw),
    telegram: compactTelegramForSource(t),
  };

  const outcome = await runIngestion(
    {
      kind: "url",
      url: body.url,
      title: body.title,
      metadata: body.metadata,
      triggerType: TRIGGER_OPENCLAW_TELEGRAM_URL,
      triggerReference,
    },
    {
      admin,
      origin: INGESTION_ORIGIN_TELEGRAM,
      sourceMetadata,
    },
  );

  const jobId = jobIdFromOutcome(outcome);

  if (outcome.ok) {
    const merged = mergeIngestionEventMetadata(inserted.metadata, {
      last_openclaw_ingestion: {
        at: new Date().toISOString(),
        job_id: outcome.job.id,
        source_id: outcome.source?.id ?? null,
        ok: true,
      },
    });
    await repo.updateIngestionEvent(inserted.id, {
      ingestion_job_id: outcome.job.id,
      source_id: outcome.source?.id ?? null,
      metadata: merged as Record<string, unknown>,
    });

    return {
      ok: true,
      deduped: false,
      eventId: inserted.id,
      job: outcome.job,
      source: outcome.source ?? undefined,
      content: outcome.content,
      artifact: outcome.artifact,
      summary: outcome.summary,
    };
  }

  const merged = mergeIngestionEventMetadata(inserted.metadata, {
    last_openclaw_ingestion: {
      at: new Date().toISOString(),
      job_id: jobId ?? null,
      source_id: null,
      ok: false,
      code: outcome.code,
      message: outcome.message,
    },
  });
  await repo.updateIngestionEvent(inserted.id, {
    ingestion_job_id: jobId ?? null,
    source_id: null,
    metadata: merged as Record<string, unknown>,
  });

  return outcome;
}
