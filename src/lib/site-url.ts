/**
 * Public site origin for OAuth callbacks and absolute links.
 * Prefer `NEXT_PUBLIC_SITE_URL` (no trailing slash). Falls back to Vercel preview URL, then localhost.
 */
export function getPublicSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}

/** Register this exact URL as the X (Twitter) app callback / redirect URI. */
export function getXOAuthCallbackUrl(): string {
  return `${getPublicSiteOrigin()}/auth/x/callback`;
}
