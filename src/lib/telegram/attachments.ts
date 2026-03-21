import type { TelegramMessage } from "@/lib/telegram/types";

type Json = Record<string, unknown> | string | number | boolean | null;

/**
 * Compact JSON summaries for `ingestion_events.attachments` (not full file downloads).
 */
export function summarizeTelegramAttachments(message: TelegramMessage): Json[] {
  const out: Json[] = [];

  if (message.photo?.length) {
    const largest = message.photo[message.photo.length - 1];
    out.push({
      kind: "photo",
      file_id: largest.file_id,
      width: largest.width,
      height: largest.height,
      file_size: largest.file_size,
    });
  }

  if (message.document) {
    out.push({
      kind: "document",
      file_id: message.document.file_id,
      file_name: message.document.file_name,
      mime_type: message.document.mime_type,
      file_size: message.document.file_size,
    });
  }

  if (message.video) {
    out.push({
      kind: "video",
      file_id: message.video.file_id,
      mime_type: message.video.mime_type,
      file_name: message.video.file_name,
    });
  }

  if (message.audio) {
    out.push({
      kind: "audio",
      file_id: message.audio.file_id,
      mime_type: message.audio.mime_type,
      title: message.audio.title,
    });
  }

  if (message.sticker) {
    out.push({
      kind: "sticker",
      file_id: message.sticker.file_id,
      emoji: message.sticker.emoji,
    });
  }

  return out;
}
