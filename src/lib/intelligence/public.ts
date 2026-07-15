const EMPTY_SLUG = "signal";

export function publicIntelligenceSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("en-CA")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 90) || EMPTY_SLUG;
}

function stableToken(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function publicSignalSlug(signal: { id: string; label: string }) {
  return `${publicIntelligenceSlug(signal.label)}--${stableToken(signal.id)}`;
}

export function publicSignalHref(signal: { id: string; label: string }) {
  return `/intelligence/trends/${publicSignalSlug(signal)}`;
}

export function publicDocumentHref(document: { id: string; title: string }) {
  return `/intelligence/articles/${encodeURIComponent(document.id)}/${publicIntelligenceSlug(document.title)}`;
}

export function publicIntelligenceExcerpt(value: string, maxLength = 1_000) {
  const cleaned = value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const slice = cleaned.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > maxLength * 0.75 ? lastSpace : slice.length).trim()}…`;
}

export function publicOriginalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase();
    if (url.protocol !== "https:") return null;
    if (hostname === "mail.google.com" || hostname.endsWith(".googleusercontent.com")) return null;
    if (hostname.includes("kit-mail") || hostname.startsWith("click.") || hostname.startsWith("track.")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

