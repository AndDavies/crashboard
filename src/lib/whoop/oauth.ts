/**
 * WHOOP OAuth 2.0 — see https://developer.whoop.com/docs/developing/oauth/
 * Register the same Redirect URL (callback) in the WHOOP Developer Dashboard.
 */

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

/** Canonical public site URL (no trailing slash), e.g. https://crashboard.dev */
export function getAppSiteUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

/**
 * Must match the Redirect URL registered with WHOOP exactly.
 * Defaults to `{NEXT_PUBLIC_SITE_URL}/auth/whoop/callback` when `WHOOP_REDIRECT_URI` is unset.
 */
export function getWhoopRedirectUri(): string | undefined {
  const explicit = process.env.WHOOP_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = getAppSiteUrl();
  if (base) return `${base}/auth/whoop/callback`;
  return undefined;
}

export function getWhoopClientId(): string | undefined {
  return process.env.WHOOP_CLIENT_ID?.trim() || undefined;
}

export function getWhoopClientSecret(): string | undefined {
  return process.env.WHOOP_CLIENT_SECRET?.trim() || undefined;
}

/** Space-delimited scopes (e.g. `offline read:recovery`). Include `offline` for refresh tokens. */
export function getWhoopOAuthScopes(): string {
  return (
    process.env.WHOOP_OAUTH_SCOPES?.trim() ||
    "offline"
  );
}

export type WhoopTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

/**
 * Build the URL to send the user to for consent (step 1 of OAuth).
 * `state` should be random (WHOOP docs: at least 8 characters) and verified on callback.
 */
export function buildWhoopAuthorizationUrl(state: string): string {
  const clientId = getWhoopClientId();
  const redirectUri = getWhoopRedirectUri();
  if (!clientId || !redirectUri) {
    throw new Error("WHOOP_CLIENT_ID and WHOOP_REDIRECT_URI must be set");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: getWhoopOAuthScopes(),
    state,
  });

  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

export async function exchangeWhoopAuthorizationCode(
  code: string,
): Promise<WhoopTokenResponse> {
  const clientId = getWhoopClientId();
  const clientSecret = getWhoopClientSecret();
  const redirectUri = getWhoopRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, and WHOOP_REDIRECT_URI must be set",
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`WHOOP token error ${res.status}: ${raw}`);
  }

  const data = JSON.parse(raw) as WhoopTokenResponse;
  if (!data.access_token) {
    throw new Error("WHOOP token response missing access_token");
  }
  return data;
}
