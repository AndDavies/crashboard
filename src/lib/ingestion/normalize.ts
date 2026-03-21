/**
 * Collapse whitespace for stable hashing and storage.
 */
export function normalizeTextForStorage(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/**
 * Strip control chars except common whitespace; keeps readable text.
 */
export function stripControlCharacters(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "");
}

export function cleanTitle(title: string | null | undefined): string | null {
  if (title == null) return null;
  const t = normalizeTextForStorage(stripControlCharacters(title));
  if (!t) return null;
  return t.length > 500 ? `${t.slice(0, 497)}...` : t;
}

/** Very rough token estimate when no tokenizer is available. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
