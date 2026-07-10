import sanitizeHtml from "sanitize-html";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const GMAIL_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export const DEFAULT_NEWSLETTER_LABELS = [
  "Newsletters/AI",
  "Newsletters/Business",
  "Newsletters/Cybersecurity",
  "Newsletters/Health and Fitness",
] as const;

export type GmailStoredCredential = {
  refreshToken: string;
  email?: string;
  scope?: string;
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};
type GmailMessage = {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

function requiredGoogleConfig() {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google Gmail OAuth credentials are not configured.");
  }
  return { clientId, clientSecret };
}

export function gmailRedirectUri() {
  const explicit = process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/intelligence/google/callback`;
}

export function gmailAuthorizationUrl(state: string, loginHint?: string | null) {
  const { clientId } = requiredGoogleConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: gmailRedirectUri(),
    response_type: "code",
    scope: GMAIL_OAUTH_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail =
      typeof body.error_description === "string"
        ? body.error_description
        : typeof body.error === "string"
          ? body.error
          : JSON.stringify(body);
    throw new Error(`Google API request failed (${response.status}): ${detail}`);
  }
  return body as T;
}

export async function exchangeGmailAuthorizationCode(code: string) {
  const { clientId, clientSecret } = requiredGoogleConfig();
  return parseJsonResponse<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }>(
    await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: gmailRedirectUri(),
      }),
      cache: "no-store",
    }),
  );
}

export async function refreshGmailAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = requiredGoogleConfig();
  const result = await parseJsonResponse<{
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }>(
    await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    }),
  );
  return result.access_token;
}

async function gmailFetch<T>(path: string, accessToken: string) {
  return parseJsonResponse<T>(
    await fetch(`${GMAIL_API}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }),
  );
}

export async function getGmailProfile(accessToken: string) {
  return gmailFetch<{ emailAddress: string; messagesTotal: number; historyId: string }>(
    "/profile",
    accessToken,
  );
}

function labelQuery(labels: readonly string[]) {
  return `{${labels.map((label) => `label:\"${label}\"`).join(" ")}}`;
}

export function newsletterBackfillQuery(windowStart: string, windowEnd: string) {
  const after = windowStart.slice(0, 10).replaceAll("-", "/");
  const end = new Date(windowEnd);
  end.setUTCDate(end.getUTCDate() + 1);
  const before = end.toISOString().slice(0, 10).replaceAll("-", "/");
  return `after:${after} before:${before} ${labelQuery(DEFAULT_NEWSLETTER_LABELS)} -in:spam -in:trash`;
}

export async function listGmailMessageIds(
  accessToken: string,
  input: { query: string; pageToken?: string | null; maxResults?: number },
) {
  const params = new URLSearchParams({
    q: input.query,
    maxResults: String(Math.max(1, Math.min(input.maxResults ?? 50, 100))),
  });
  if (input.pageToken) params.set("pageToken", input.pageToken);
  return gmailFetch<{
    messages?: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }>(`/messages?${params}`, accessToken);
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string,
  format: "full" | "metadata" = "full",
) {
  const params = new URLSearchParams({ format });
  if (format === "metadata") {
    for (const header of ["From", "Subject", "Date", "List-Unsubscribe", "Precedence"]) {
      params.append("metadataHeaders", header);
    }
  }
  return gmailFetch<GmailMessage>(`/messages/${encodeURIComponent(messageId)}?${params}`, accessToken);
}

function decodeBase64Url(value: string | undefined) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function collectBodies(part: GmailPart | undefined, bodies: { plain: string[]; html: string[] }) {
  if (!part) return;
  const decoded = decodeBase64Url(part.body?.data);
  if (decoded && part.mimeType === "text/plain") bodies.plain.push(decoded);
  if (decoded && part.mimeType === "text/html") bodies.html.push(decoded);
  for (const child of part.parts ?? []) collectBodies(child, bodies);
}

function headers(part: GmailPart | undefined) {
  const map = new Map<string, string>();
  for (const header of part?.headers ?? []) {
    if (header.name && header.value) map.set(header.name.toLowerCase(), header.value);
  }
  return map;
}

function senderName(from: string) {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/u);
  return (match?.[1] ?? from.split("@")[0] ?? from).trim();
}

function senderEmail(from: string) {
  return from.match(/<([^>]+)>/u)?.[1]?.trim() ?? from.trim();
}

function isoDateOrNull(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function htmlToText(html: string) {
  return sanitizeHtml(html.replace(/<\/?(?:p|div|li|br|h[1-6]|tr|td)\b[^>]*>/giu, " "), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function externalLinks(html: string) {
  const matches = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/giu)];
  return [...new Set(matches.map((match) => match[1].replace(/&amp;/g, "&")))].slice(0, 100);
}

function likelyCanonicalLink(links: string[]) {
  return (
    links.find((link) => {
      const lower = link.toLowerCase();
      return !/(unsubscribe|preferences|mailto:|facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com)/u.test(
        lower,
      );
    }) ?? null
  );
}

export function gmailMessageToEnvelope(
  message: GmailMessage,
  ownerId: string,
): IntelligenceDocumentEnvelope {
  const headerMap = headers(message.payload);
  const from = headerMap.get("from") ?? "Unknown newsletter";
  const bodies = { plain: [] as string[], html: [] as string[] };
  collectBodies(message.payload, bodies);
  const html = bodies.html.join("\n");
  const contentText =
    bodies.plain.join("\n").replace(/\s+/g, " ").trim() ||
    htmlToText(html) ||
    message.snippet?.trim() ||
    "[No readable body content]";
  const links = externalLinks(html);
  const internalDate = message.internalDate ? Number(message.internalDate) : NaN;
  const publishedAt = Number.isFinite(internalDate)
    ? new Date(internalDate).toISOString()
    : isoDateOrNull(headerMap.get("date"));

  return {
    ownerId,
    sourceType: "email_newsletter",
    externalId: message.id,
    originalUrl: `https://mail.google.com/mail/u/0/#all/${message.id}`,
    canonicalUrl: likelyCanonicalLink(links),
    title: headerMap.get("subject") ?? "Untitled newsletter",
    authorName: senderName(from),
    publisherName: senderName(from),
    language: "en",
    publishedAt,
    contentText,
    summaryShort: message.snippet ?? null,
    sourceChannel: "gmail",
    labels: message.labelIds ?? [],
    metadata: {
      gmail_thread_id: message.threadId ?? null,
      sender_email: senderEmail(from),
      list_unsubscribe: headerMap.get("list-unsubscribe") ?? null,
      precedence: headerMap.get("precedence") ?? null,
      extracted_links: links,
    },
  };
}

export function isNewsletterCandidate(message: GmailMessage) {
  const headerMap = headers(message.payload);
  return Boolean(
    headerMap.get("list-unsubscribe") ||
      /\b(bulk|list)\b/iu.test(headerMap.get("precedence") ?? ""),
  );
}

export async function sendGmailMessage(
  accessToken: string,
  input: { to: string; subject: string; text: string; html?: string },
) {
  const boundary = `crashboard-${Date.now()}`;
  const body = input.html
    ? [
        `Content-Type: multipart/alternative; boundary=${boundary}`,
        "MIME-Version: 1.0",
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        "",
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        input.text,
        `--${boundary}`,
        "Content-Type: text/html; charset=UTF-8",
        "",
        input.html,
        `--${boundary}--`,
      ].join("\r\n")
    : [
        "Content-Type: text/plain; charset=UTF-8",
        "MIME-Version: 1.0",
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        "",
        input.text,
      ].join("\r\n");
  const raw = Buffer.from(body, "utf8").toString("base64url");
  return parseJsonResponse<{ id: string; threadId: string }>(
    await fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ raw }),
      cache: "no-store",
    }),
  );
}
