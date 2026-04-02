import { ingestOpenclawPhase1 } from "@/lib/ingestion/openclaw-phase1";
import type { OpenclawIngestionBody } from "@/lib/openclaw/ingestion/schema";
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
  documentId?: string;
  deduped?: boolean;
  sourceType?: string;
  errorCode?: string;
  message?: string;
  warnings?: string[];
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
 * Telegram URL ingestion: extracts URLs and runs Phase 1 ingestion per URL.
 *
 * This is intentionally "stateless" with respect to message-level provenance tables.
 * The live DB schema currently persists canonical document graph only (`documents`,
 * `entities`, `embeddings`), so we dedupe by URL in `documents` and surface `deduped`
 * per URL.
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

  const results: TelegramUrlResultRow[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;

    const attachments = summarizeTelegramAttachments(message);

    const body: OpenclawIngestionBody = {
      kind: "url",
      url,
      metadata: {
        update_id: updateId,
        edited,
        chat_type: message.chat.type,
        message_date: message.date,
        attachments,
      },
      openclaw: {
        orchestrator: "telegram",
        channel: "telegram",
      },
      telegram: {
        chat_id: chatId,
        message_id: messageId,
        thread_id: threadId,
        sender_id: senderId(message),
        sender_label: senderLabel(message) ?? undefined,
        raw_text: text.trim() || undefined,
      },
    };

    const outcome = await ingestOpenclawPhase1(body, admin);

    if (outcome.ok) {
      results.push({
        url,
        index: i,
        ok: true,
        documentId: outcome.documentId,
        deduped: outcome.deduped,
        sourceType: outcome.sourceType,
        warnings: outcome.warnings,
      });
    } else {
      results.push({
        url,
        index: i,
        ok: false,
        errorCode: outcome.code,
        message: outcome.message,
      });
    }
  }

  return {
    handled: true,
    urlCount: urls.length,
    results,
  };
}
