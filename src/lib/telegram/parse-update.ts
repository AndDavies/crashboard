import type { TelegramMessage } from "@/lib/telegram/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asMessage(v: unknown): TelegramMessage | null {
  if (!isRecord(v)) return null;
  const mid = v.message_id;
  const chat = v.chat;
  if (typeof mid !== "number" || !isRecord(chat) || typeof chat.id !== "number") {
    return null;
  }
  return v as unknown as TelegramMessage;
}

/**
 * Resolve the user-visible message from an update (posts, edits, channels).
 */
export function getTelegramMessageFromUpdate(
  update: unknown,
): { message: TelegramMessage; edited: boolean } | null {
  if (!isRecord(update)) return null;

  if (update.message) {
    const m = asMessage(update.message);
    if (m) return { message: m, edited: false };
  }
  if (update.channel_post) {
    const m = asMessage(update.channel_post);
    if (m) return { message: m, edited: false };
  }
  if (update.edited_message) {
    const m = asMessage(update.edited_message);
    if (m) return { message: m, edited: true };
  }
  if (update.edited_channel_post) {
    const m = asMessage(update.edited_channel_post);
    if (m) return { message: m, edited: true };
  }

  return null;
}

export function getUpdateId(update: unknown): number | null {
  if (!isRecord(update) || typeof update.update_id !== "number") return null;
  return update.update_id;
}
