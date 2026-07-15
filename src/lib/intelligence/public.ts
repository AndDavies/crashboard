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

const PUBLIC_NEWSLETTER_CHROME = [
  /\bview (?:this email )?(?:online|in (?:your )?browser)\b(?:\s*\[?\d+\]?)?(?:\s*[|·•—–-]\s*)?/giu,
  /\b(?:manage (?:your )?preferences|update your profile|unsubscribe|forward to a friend)\b\s*:?\s*/giu,
  /\b(?:sign up|advertise(?: with us)?)\b(?:\s*\[?\d+\]?)?(?:\s*[|·•-]\s*)?/giu,
  /\bTLDR TOGETHER WITH\b(?:\s*\[[^\]]{1,80}\])?(?:\s*[|·•—–-]\s*)?/giu,
];

function cleanPublicIntelligenceText(value: string) {
  let cleaned = value
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, " ")
    .replace(/https?:\/\/\S*(?:utm_[a-z]+|\/click|\/track)\S*/giu, " ")
    .replace(/\b[a-f0-9]{8,}\?(?:j|m|u|utm_[a-z]+)=[^\s]*/giu, " ");
  for (const pattern of PUBLIC_NEWSLETTER_CHROME) cleaned = cleaned.replace(pattern, " ");
  return cleaned
    .replace(/(?:\s*[|·•]\s*){2,}/gu, " · ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function publicIntelligenceTitle(value: string | null | undefined) {
  const cleaned = cleanPublicIntelligenceText(value ?? "")
    .replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s|·•—–-]+/gu, "")
    .replace(/^(?:fwd?|re):\s*/giu, "")
    .trim();
  return cleaned || "Untitled source";
}

export function publicIntelligenceExcerpt(value: string, maxLength = 1_000) {
  const cleaned = cleanPublicIntelligenceText(value);
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
