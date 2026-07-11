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
  return [...text]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      const isDisallowedControl =
        (codePoint >= 0x00 && codePoint <= 0x08) ||
        codePoint === 0x0b ||
        codePoint === 0x0c ||
        (codePoint >= 0x0e && codePoint <= 0x1f);
      const isUnpairedSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
      return !isDisallowedControl && !isUnpairedSurrogate;
    })
    .join("");
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
