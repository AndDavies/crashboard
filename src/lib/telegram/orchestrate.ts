import { INGESTION_ORIGIN_TELEGRAM } from "@/lib/ingestion/constants";
import {
  createIngestionRepository,
  mergeIngestionEventMetadata,
  type Json,
} from "@/lib/ingestion/repository";
import { runIngestion } from "@/lib/ingestion/service";
import type {
  IngestionServiceError,
  IngestionServiceResult,
} from "@/lib/ingestion/types";
import { summarizeTelegramAttachments } from "@/lib/telegram/attachments";
import {
  getTelegramMessageFromUpdate,
  getUpdateId,
} from "@/lib/telegram/parse-update";
import { extractHttpUrlsFromText } from "@/lib/telegram/urls";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramMessage } from "@/lib/telegram/types";

export interface TelegramUrlIngestSummary {
  handled: boolean;
  /** True when this chat/thread/message was already recorded (webhook retry). */
  deduped?: boolean;
  eventId?: string;
  urlCount?: number;
  results?: TelegramUrlResultRow[];
  ignoredReason?: string;
}

export interface TelegramUrlResultRow {
  url: string;
  index: number;
  ok: boolean;
  jobId?: string;
  sourceId?: string;
  jobStatus?: string;
  errorCode?: string;
  message?: string;
}

function jobIdFromOutcome(
  o: IngestionServiceResult | IngestionServiceError,
): string | undefined {
  if (o.ok) return o.job.id;
  const id = o.details?.jobId;
  return typeof id === "string" ? id : undefined;
}

function senderLabel(message: TelegramMessage): string | null {
  const u = message.from;
  if (u?.username?.trim()) return `@${u.username.trim()}`;
  const parts = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  if (message.sender_chat?.title) return message.sender_chat.title;
  return null;
}

function senderId(message: TelegramMessage): number | null {
  if (typeof message.from?.id === "number") return message.from.id;
  if (typeof message.sender_chat?.id === "number") return message.sender_chat.id;
  return null;
}

/**
 * Idempotent Telegram URL ingestion: one `ingestion_events` row per message, then sequential `runIngestion` per URL.
 */
export async function orchestrateTelegramUrlIngestion(
  update: unknown,
  admin: SupabaseClient,
): Promise<TelegramUrlIngestSummary> {
  const updateId = getUpdateId(update);
  const resolved = getTelegramMessageFromUpdate(update);
  if (!resolved) {
    return { handled: false, ignoredReason: "no_supported_message" };
  }

  const { message, edited } = resolved;
  const text = [message.text, message.caption].filter(Boolean).join("\n") || "";
  const urls = extractHttpUrlsFromText(text);
  if (urls.length === 0) {
    return { handled: false, ignoredReason: "no_http_urls" };
  }

  const chatId = message.chat.id;
  const messageId = message.message_id;
  const threadId =
    typeof message.message_thread_id === "number"
      ? message.message_thread_id
      : null;

  const repo = createIngestionRepository(admin);

  const inserted = await repo.tryInsertTelegramIngestionEvent({
    chat_id: chatId,
    thread_id: threadId,
    message_id: messageId,
    sender_id: senderId(message),
    sender_label: senderLabel(message),
    raw_text: text.trim() || null,
    attachments: summarizeTelegramAttachments(message) as Json[],
    metadata: {
      phase1c: true,
      update_id: updateId,
      chat_type: message.chat.type,
      message_date: message.date,
      edited,
    },
  });

  if (!inserted) {
    const existing = await repo.findTelegramEventByMessageKey({
      chatId,
      threadId,
      messageId,
    });
    if (!existing) {
      return {
        handled: true,
        deduped: true,
        ignoredReason: "dedupe_race_no_row",
      };
    }
    return {
      handled: true,
      deduped: true,
      eventId: existing.id,
      urlCount: urls.length,
      results: [],
    };
  }

  const eventRow = inserted;

  const compactSourceMeta = {
    ingested_via: "telegram" as const,
    telegram: {
      chat_id: chatId,
      message_id: messageId,
      thread_id: threadId,
    },
  };

  const results: TelegramUrlResultRow[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    const outcome = await runIngestion(
      {
        kind: "url",
        url,
        metadata: {},
        triggerType: "telegram.url",
        triggerReference: `telegram:${chatId}:msg:${messageId}:url:${i}`,
      },
      {
        admin,
        origin: INGESTION_ORIGIN_TELEGRAM,
        sourceMetadata: compactSourceMeta,
      },
    );

    const jobId = jobIdFromOutcome(outcome);
    if (outcome.ok) {
      results.push({
        url,
        index: i,
        ok: true,
        jobId,
        sourceId: outcome.source?.id,
        jobStatus: outcome.job.status,
      });
    } else {
      results.push({
        url,
        index: i,
        ok: false,
        jobId,
        jobStatus: undefined,
        errorCode: outcome.code,
        message: outcome.message,
      });
    }
  }

  const primaryJobId = results.find((r) => r.jobId)?.jobId;
  const primarySourceId = results.find((r) => r.ok && r.sourceId)?.sourceId;

  const mergedMeta = mergeIngestionEventMetadata(eventRow.metadata, {
    url_results: results,
    url_count: urls.length,
    finished_at: new Date().toISOString(),
  });

  await repo.updateIngestionEvent(eventRow.id, {
    ingestion_job_id: primaryJobId ?? null,
    source_id: primarySourceId ?? null,
    metadata: mergedMeta as Record<string, unknown>,
  });

  return {
    handled: true,
    deduped: false,
    eventId: eventRow.id,
    urlCount: urls.length,
    results,
  };
}
