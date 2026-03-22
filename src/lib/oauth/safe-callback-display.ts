const DEFAULT_MAX_LEN = 96;

/** Keys we never show in the UI (OAuth tokens, secrets). */
/** OAuth tokens and true secrets — not `client_id` (often public). */
const REDACT_KEYS =
  /^(client_secret|access_token|refresh_token|id_token|password)$/i;

export function truncateForDisplay(
  value: string,
  maxLen: number = DEFAULT_MAX_LEN,
): { text: string; truncated: boolean } {
  if (value.length <= maxLen) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, maxLen - 1)}…`,
    truncated: true,
  };
}

export type CallbackParamRow = {
  key: string;
  displayValue: string;
  truncated: boolean;
  redacted: boolean;
};

/**
 * Flatten Next.js `searchParams` into display rows: truncate long values, redact sensitive keys.
 */
export function buildSafeCallbackParamRows(
  searchParams: Record<string, string | string[] | undefined>,
): CallbackParamRow[] {
  const rows: CallbackParamRow[] = [];

  for (const [key, raw] of Object.entries(searchParams)) {
    if (raw === undefined) continue;
    const value = Array.isArray(raw) ? raw.join(", ") : raw;
    if (REDACT_KEYS.test(key)) {
      rows.push({
        key,
        displayValue: "—",
        truncated: false,
        redacted: true,
      });
      continue;
    }
    const { text, truncated } = truncateForDisplay(value);
    rows.push({
      key,
      displayValue: text || "(empty)",
      truncated,
      redacted: false,
    });
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

/** Plain object for structured server logs (still avoid logging env/cookies). */
export function flattenSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.join(",") : v;
  }
  return out;
}
