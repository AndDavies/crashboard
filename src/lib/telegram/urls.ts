const HTTPS_URL =
  /\bhttps:\/\/[^\s<>"'()[\]{}\u00ab\u00bb]+/gi;
const HTTP_URL =
  /\bhttp:\/\/[^\s<>"'()[\]{}\u00ab\u00bb]+/gi;

/**
 * Extract http(s) URLs from free text (message body or caption). Order preserved; duplicates removed.
 */
export function extractHttpUrlsFromText(text: string | undefined | null): string[] {
  if (!text?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string) => {
    const u = trimTrailingPunctuation(raw);
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  for (const re of [HTTPS_URL, HTTP_URL]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      push(m[0]);
    }
  }
  return out;
}

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;:!?'"\u201d\u2019]+$/u, "");
}
