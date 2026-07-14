import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function googleDashboardConfig() {
  const clientId = process.env.GOOGLE_DASHBOARD_CLIENT_ID?.trim()
    || process.env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DASHBOARD_CLIENT_SECRET?.trim()
    || process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Google dashboard OAuth credentials are not configured.");
  return { clientId, clientSecret };
}

export function dashboardGoogleRedirectUri(origin?: string) {
  const explicit = process.env.GOOGLE_DASHBOARD_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = origin || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return `${base.replace(/\/$/u, "")}/api/auth/google/callback`;
}

export function dashboardGoogleAuthorizationUrl(state: string, origin?: string, loginHint?: string) {
  const { clientId } = googleDashboardConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: dashboardGoogleRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params}`;
}

export async function exchangeDashboardGoogleCode(code: string, origin?: string) {
  const { clientId, clientSecret } = googleDashboardConfig();
  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: dashboardGoogleRedirectUri(origin),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.id_token !== "string") {
    throw new Error(`Google sign-in failed (${response.status}).`);
  }
  const { payload } = await jwtVerify(body.id_token, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  });
  const email = typeof payload.email === "string" ? payload.email.toLocaleLowerCase() : "";
  if (!email || payload.email_verified !== true || !payload.sub) {
    throw new Error("Google did not return a verified email address.");
  }
  return {
    id: process.env.INTELLIGENCE_OWNER_ID?.trim() || `google:${email}`,
    email,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
