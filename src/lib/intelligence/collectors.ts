import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractFromHtml,
  extractFromPlainText,
  normalizeIngestionUrl,
} from "@/lib/ingestion/url";
import { normalizeTextForStorage } from "@/lib/ingestion/normalize";
import { processIntelligenceDocument } from "@/lib/intelligence/pipeline";
import { normalizeSourceUrl } from "@/lib/intelligence/source-url";
import type {
  IntelligenceDocumentEnvelope,
  IntelligenceSourceAdapter,
  IntelligenceSourceType,
  SourceDiscoveryPage,
} from "@/lib/intelligence/types";

const COLLECTION_USER_AGENT = "CrashboardIntelligence/2.0 (+https://crashboard.dev)";
const DEFAULT_PAGE_LIMIT = 25;
const DEFAULT_TIME_BUDGET_MS = 210_000;
const MAX_RESPONSE_BYTES = 5_000_000;
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_DOMAIN_INTERVAL_MS = 250;
const TRANSIENT_RETRIES = 2;
const MAX_IN_REQUEST_RETRY_DELAY_MS = 15_000;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const PODCAST_NAMESPACE = "https://podcastindex.org/namespace/1.0";
const PODCAST_TRANSCRIPT_TYPES = new Set([
  "application/json",
  "application/x-subrip",
  "text/html",
  "text/plain",
  "text/vtt",
]);

const domainQueues = new Map<string, Promise<void>>();
const domainNextRequestAt = new Map<string, number>();

class CollectorHttpError extends Error {
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  readonly transient: boolean;

  constructor(
    message: string,
    options: { status?: number | null; retryAfterMs?: number | null; transient?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "CollectorHttpError";
    this.status = options.status ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.transient = options.transient ?? false;
  }
}

export type IntelligenceSourceCohort = "measurement" | "research";

export type CollectionSourceRow = {
  id: string;
  owner_id: string;
  source_type:
    | "rss"
    | "website"
    | "procurement_portal"
    | "youtube"
    | "podcast"
    | "reddit"
    | "social"
    | "manual";
  name: string;
  external_key: string;
  status: string;
  cohort: IntelligenceSourceCohort;
  measurement_active_from: string | null;
  discovery_origin: string | null;
  triggering_research_lead_id: string | null;
  robots_status: "unknown" | "allowed" | "disallowed" | "not_applicable";
  config: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  last_synced_at: string | null;
  last_successful_fetch_at: string | null;
  fetch_failure_count: number;
  fetch_cooldown_until: string | null;
};

type PodcastTranscriptLink = {
  url: string;
  type: string;
  language: string | null;
  rel: string | null;
};

type FeedEntry = {
  id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  summary: string | null;
  transcripts: PodcastTranscriptLink[];
};

type RobotsRule = {
  allow: boolean;
  path: string;
};

type SourceConfig = {
  feedUrl?: string;
  sitemapUrl?: string;
  datasetUrl?: string;
  datasetId?: string;
  apiUrl?: string;
  expertQuery?: string;
  adapter?: string;
  discoverLinks: boolean;
  linkPathPatterns: string[];
  urls: string[];
  publisher?: string;
  language?: string;
  channelId?: string;
  playlistId?: string;
  videoIds: string[];
  includeCaptions: boolean;
  subreddit?: string;
  xUserId?: string;
  xUsername?: string;
};

export type CollectionRunResult = {
  runId: string;
  sources: number;
  discovered: number;
  processed: number;
  failed: number;
  excluded: number;
  hasMore: boolean;
  errors: string[];
};

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function sourceConfig(source: CollectionSourceRow): SourceConfig {
  const config = source.config ?? {};
  return {
    feedUrl: stringValue(config.feed_url) ?? stringValue(config.feedUrl),
    sitemapUrl: stringValue(config.sitemap_url) ?? stringValue(config.sitemapUrl),
    datasetUrl: stringValue(config.dataset_url) ?? stringValue(config.datasetUrl),
    datasetId: stringValue(config.dataset_id) ?? stringValue(config.datasetId),
    apiUrl: stringValue(config.api_url) ?? stringValue(config.apiUrl),
    expertQuery: stringValue(config.expert_query) ?? stringValue(config.expertQuery),
    adapter: stringValue(config.adapter),
    discoverLinks: config.discover_links === true || config.discoverLinks === true,
    linkPathPatterns: stringArray(config.link_path_patterns ?? config.linkPathPatterns),
    urls: stringArray(config.urls),
    publisher: stringValue(config.publisher) ?? source.name,
    language: stringValue(config.language) ?? "en",
    channelId: stringValue(config.channel_id) ?? stringValue(config.channelId),
    playlistId: stringValue(config.playlist_id) ?? stringValue(config.playlistId),
    videoIds: stringArray(config.video_ids ?? config.videoIds),
    includeCaptions: config.include_captions === true || config.includeCaptions === true,
    subreddit: stringValue(config.subreddit),
    xUserId: stringValue(config.x_user_id) ?? stringValue(config.xUserId),
    xUsername: stringValue(config.x_username) ?? stringValue(config.xUsername),
  };
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this approved API adapter.`);
  return value;
}

function sleep(milliseconds: number) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function collectorDomainIntervalMs() {
  if (process.env.NODE_ENV === "test") return 0;
  const configured = Number(process.env.INTELLIGENCE_COLLECTOR_DOMAIN_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_DOMAIN_INTERVAL_MS;
  return Math.max(0, Math.min(Math.trunc(configured), 5_000));
}

function domainKey(url: string | URL) {
  return new URL(url).hostname.toLowerCase();
}

async function paceDomain(url: string | URL) {
  const key = domainKey(url);
  const previous = domainQueues.get(key) ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      const waitMs = Math.max(0, (domainNextRequestAt.get(key) ?? 0) - Date.now());
      await sleep(waitMs);
      domainNextRequestAt.set(key, Date.now() + collectorDomainIntervalMs());
    });
  domainQueues.set(key, queued);
  await queued;
  if (domainQueues.get(key) === queued) domainQueues.delete(key);
}

function parseRetryAfter(value: string | null, now = Date.now()) {
  if (!value?.trim()) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - now);
}

function retryDelayMs(attempt: number, retryAfterMs: number | null) {
  const fallback = 250 * 2 ** attempt;
  return Math.min(retryAfterMs ?? fallback, MAX_IN_REQUEST_RETRY_DELAY_MS);
}

async function collectorFetch(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = 20_000,
) {
  const normalizedUrl = url instanceof URL ? url : new URL(normalizeIngestionUrl(url));
  if (!publicFetchUrl(normalizedUrl.toString())) {
    throw new Error("Private-network source URLs are not permitted.");
  }

  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let requestUrl = normalizedUrl;
      let requestInit: RequestInit = { ...init };
      let response: Response | null = null;
      for (let redirect = 0; redirect <= 5; redirect += 1) {
        if (!publicFetchUrl(requestUrl.toString())) {
          throw new CollectorHttpError("Redirects to private-network source URLs are not permitted.");
        }
        await paceDomain(requestUrl);
        response = await fetch(requestUrl, {
          ...requestInit,
          redirect: "manual",
          signal: controller.signal,
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("Location");
        if (!location) break;
        if (redirect >= 5) {
          await response.body?.cancel();
          throw new CollectorHttpError("Remote source exceeded five redirects.");
        }
        const nextUrl = new URL(location, requestUrl);
        if (!publicFetchUrl(nextUrl.toString())) {
          await response.body?.cancel();
          throw new CollectorHttpError("Redirects to private-network source URLs are not permitted.");
        }
        await response.body?.cancel();
        if (response.status === 303 || ([301, 302].includes(response.status) && requestInit.method === "POST")) {
          requestInit = { ...requestInit, method: "GET", body: undefined };
        }
        requestUrl = nextUrl;
      }
      if (!response) throw new Error("Collector request returned no response.");
      if (!TRANSIENT_HTTP_STATUSES.has(response.status)) return response;

      const retryAfterMs = parseRetryAfter(response.headers.get("Retry-After"));
      const error = new CollectorHttpError(
        `HTTP ${response.status} after ${attempt + 1} collector attempt${attempt ? "s" : ""}.`,
        { status: response.status, retryAfterMs, transient: true },
      );
      if (attempt >= TRANSIENT_RETRIES) throw error;
      await response.body?.cancel();
      await sleep(retryDelayMs(attempt, retryAfterMs));
    } catch (error) {
      if (error instanceof CollectorHttpError) throw error;
      if (attempt >= TRANSIENT_RETRIES) {
        throw new CollectorHttpError(
          `Collector request failed after ${attempt + 1} attempts.`,
          { transient: true, cause: error },
        );
      }
      await sleep(retryDelayMs(attempt, null));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new CollectorHttpError("Collector request failed after three attempts.", { transient: true });
}

async function readLimitedText(response: Response, maximumBytes = MAX_RESPONSE_BYTES) {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    await response.body?.cancel();
    throw new Error(`Remote source exceeds ${Math.round(maximumBytes / 1_000_000)} MB.`);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let totalBytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error(`Remote source exceeds ${Math.round(maximumBytes / 1_000_000)} MB.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function collectorCooldownMs(error: unknown) {
  if (error instanceof CollectorHttpError && error.transient) {
    if (error.status === 429 || error.retryAfterMs !== null) {
      return Math.max(60_000, error.retryAfterMs ?? 15 * 60_000);
    }
    return 15 * 60_000;
  }
  return RETRY_COOLDOWN_MS;
}

async function apiJson<T>(
  url: URL,
  options: {
    authorization?: string;
    basicAuthorization?: string;
    method?: "GET" | "POST";
    body?: URLSearchParams | string;
    contentType?: string;
  } = {},
) {
  const response = await collectorFetch(url, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": COLLECTION_USER_AGENT,
      ...(options.authorization ? { Authorization: options.authorization } : {}),
      ...(options.basicAuthorization ? { Authorization: options.basicAuthorization } : {}),
      ...(options.body
        ? { "Content-Type": options.contentType ?? "application/x-www-form-urlencoded" }
        : {}),
    },
    body: options.body,
    cache: "no-store",
  });
  const text = await readLimitedText(response);
  if (!response.ok) throw new Error(`Approved API request failed with HTTP ${response.status}.`);
  return JSON.parse(text) as T;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvRecords(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/u, ""));
  const headers = rows.shift() ?? [];
  return rows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function publicFetchUrl(value: string) {
  const parsed = new URL(normalizeIngestionUrl(value));
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return false;
  }
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    const [first, second] = octets;
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    ) {
      return false;
    }
  }
  return true;
}

function xmlText(value: string) {
  return normalizeTextForStorage(load(`<root>${value}</root>`, { xmlMode: true }).text());
}

function parseFeed(xml: string, baseUrl: string): FeedEntry[] {
  const $ = load(xml, { xmlMode: true });
  const podcastPrefixes = new Set<string>();
  $("*").each((_, element) => {
    const attributes = $(element).attr() ?? {};
    for (const [attribute, value] of Object.entries(attributes)) {
      if (
        attribute.toLowerCase().startsWith("xmlns:") &&
        value.replace(/\/+$/u, "") === PODCAST_NAMESPACE
      ) {
        podcastPrefixes.add(attribute.slice(attribute.indexOf(":") + 1).toLowerCase());
      }
    }
  });
  const publisher =
    normalizeTextForStorage($("channel > title").first().text()) ||
    normalizeTextForStorage($("feed > title").first().text()) ||
    null;
  const entries: FeedEntry[] = [];

  $("item, entry").each((_, element) => {
    const node = $(element);
    const rawLink =
      node.find("link[rel='alternate']").first().attr("href") ??
      node.find("link").first().attr("href") ??
      node.find("link").first().text();
    let url: string | null = null;
    try {
      url = normalizeSourceUrl(new URL(rawLink?.trim() || "", baseUrl).toString());
    } catch {
      url = null;
    }
    if (!url) return;
    const rawId =
      normalizeTextForStorage(node.find("guid").first().text()) ||
      normalizeTextForStorage(node.find("id").first().text()) ||
      url;
    const summaryRaw =
      node.find("content\\:encoded").first().text() ||
      node.find("content").first().text() ||
      node.find("description").first().text() ||
      node.find("summary").first().text();
    const transcripts = node
      .find("*")
      .toArray()
      .flatMap((child): PodcastTranscriptLink[] => {
        const tagName = "name" in child && typeof child.name === "string" ? child.name : "";
        const separator = tagName.indexOf(":");
        if (separator < 1 || tagName.slice(separator + 1).toLowerCase() !== "transcript") return [];
        if (!podcastPrefixes.has(tagName.slice(0, separator).toLowerCase())) return [];
        const transcriptNode = $(child);
        const rawUrl = transcriptNode.attr("url")?.trim();
        const type = transcriptNode.attr("type")?.trim().toLowerCase();
        if (!rawUrl || !type || !PODCAST_TRANSCRIPT_TYPES.has(type)) return [];
        try {
          const transcriptUrl = new URL(rawUrl, baseUrl);
          if (transcriptUrl.protocol !== "https:" || !publicFetchUrl(transcriptUrl.toString())) return [];
          return [{
            url: normalizeSourceUrl(transcriptUrl.toString()) ?? transcriptUrl.toString(),
            type,
            language: transcriptNode.attr("language")?.trim() || null,
            rel: transcriptNode.attr("rel")?.trim() || null,
          }];
        } catch {
          return [];
        }
      })
      .filter((transcript, index, all) =>
        all.findIndex((candidate) => candidate.url === transcript.url && candidate.type === transcript.type) === index,
      );
    entries.push({
      id: rawId,
      url,
      title: normalizeTextForStorage(node.find("title").first().text()) || null,
      publisher,
      author:
        normalizeTextForStorage(node.find("author > name").first().text()) ||
        normalizeTextForStorage(node.find("dc\\:creator").first().text()) ||
        null,
      publishedAt: safeDate(
        node.find("pubDate").first().text() ||
          node.find("published").first().text() ||
          node.find("updated").first().text(),
      ),
      summary: summaryRaw ? xmlText(summaryRaw).slice(0, 2_000) : null,
      transcripts,
    });
  });
  return entries;
}

function parseSitemap(xml: string, baseUrl: string) {
  const $ = load(xml, { xmlMode: true });
  return [
    ...new Set(
      $("url > loc")
        .toArray()
        .map((node) => $(node).text().trim())
        .map((value) => {
          try {
            return normalizeSourceUrl(new URL(value, baseUrl).toString());
          } catch {
            return null;
          }
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function pathMatches(pathname: string, patterns: string[]) {
  if (!patterns.length) return true;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "iu").test(pathname);
    } catch {
      return pathname.includes(pattern);
    }
  });
}

async function discoverPageLinks(seedUrl: string, patterns: string[]) {
  const permission = await robotsPermission(seedUrl);
  if (!permission.allowed) throw new Error(`robots.txt disallows ${seedUrl}`);
  const page = await fetchText(seedUrl, "text/html,application/xhtml+xml");
  const $ = load(page.text);
  const seed = new URL(page.url);
  return [
    ...new Set(
      $("a[href]")
        .toArray()
        .map((element) => $(element).attr("href"))
        .map((href) => {
          try {
            return normalizeSourceUrl(new URL(href?.trim() || "", seed).toString());
          } catch {
            return null;
          }
        })
        .filter((url): url is string => {
          if (!url) return false;
          const parsed = new URL(url);
          return (
            parsed.hostname.replace(/^www\./u, "") === seed.hostname.replace(/^www\./u, "") &&
            pathMatches(parsed.pathname, patterns)
          );
        }),
    ),
  ].slice(0, 500);
}

function robotsPathMatches(rulePath: string, requestedPath: string) {
  const escaped = rulePath
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replace(/\\\$$/u, "$");
  try {
    return new RegExp(`^${escaped}`, "u").test(requestedPath);
  } catch {
    return requestedPath.startsWith(rulePath.replaceAll("*", ""));
  }
}

export function parseRobotsRules(text: string, userAgent = COLLECTION_USER_AGENT) {
  const wantedAgents = [userAgent.toLowerCase(), "crashboardintelligence", "*"];
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      if (!value && field === "disallow") continue;
      current.rules.push({ allow: field === "allow", path: value || "/" });
    }
  }

  const matching = groups.filter((group) =>
    group.agents.some((agent) => wantedAgents.some((wanted) => agent === wanted)),
  );
  const specific = matching.filter((group) => !group.agents.includes("*"));
  return (specific.length ? specific : matching).flatMap((group) => group.rules);
}

export function isRobotsAllowed(rules: RobotsRule[], url: string) {
  const parsed = new URL(url);
  const requestedPath = `${parsed.pathname}${parsed.search}`;
  const matching = rules
    .filter((rule) => robotsPathMatches(rule.path, requestedPath))
    .sort((left, right) => right.path.length - left.path.length);
  return matching[0]?.allow ?? true;
}

async function fetchText(url: string, accept: string) {
  const response = await collectorFetch(normalizeIngestionUrl(url), {
    redirect: "follow",
    headers: { "User-Agent": COLLECTION_USER_AGENT, Accept: accept },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} when fetching ${url}.`);
  return {
    text: await readLimitedText(response),
    url: response.url || url,
    contentType: response.headers.get("content-type")?.toLowerCase() ?? "",
  };
}

export async function robotsPermission(url: string) {
  if (!publicFetchUrl(url)) {
    return {
      allowed: false,
      status: "disallowed" as const,
      robotsUrl: "",
    };
  }
  const parsed = new URL(normalizeIngestionUrl(url));
  const robotsUrl = `${parsed.origin}/robots.txt`;
  try {
    const response = await collectorFetch(robotsUrl, {
      headers: { "User-Agent": COLLECTION_USER_AGENT, Accept: "text/plain" },
      cache: "no-store",
    }, 10_000);
    if (response.status === 401 || response.status === 403) {
      return { allowed: false, status: "disallowed" as const, robotsUrl };
    }
    if (!response.ok) return { allowed: true, status: "not_applicable" as const, robotsUrl };
    const rules = parseRobotsRules(await readLimitedText(response));
    return {
      allowed: isRobotsAllowed(rules, url),
      status: isRobotsAllowed(rules, url) ? ("allowed" as const) : ("disallowed" as const),
      robotsUrl,
    };
  } catch (error) {
    if (error instanceof CollectorHttpError && error.transient) {
      return { allowed: false, status: "unknown" as const, robotsUrl };
    }
    return { allowed: true, status: "unknown" as const, robotsUrl };
  }
}

function sourceTypeFor(source: CollectionSourceRow): IntelligenceSourceType {
  if (source.source_type === "procurement_portal") return "procurement_notice";
  if (source.source_type === "youtube") return "youtube_video";
  if (source.source_type === "podcast") return "podcast_episode";
  if (source.source_type === "reddit") return "reddit_post";
  if (source.source_type === "social") return "social_post";
  const authority = stringValue(source.config?.authority);
  return authority === "official" ? "official_release" : "web_article";
}

function transcriptJsonText(raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return "";
  }
  const parts: string[] = [];
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if (/^(?:body|caption|content|dialogue|sentence|text|transcript|utterance)$/iu.test(key)) {
        parts.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (value && typeof value === "object") {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
    }
  };
  visit(parsed);
  return normalizeTextForStorage(parts.join(" "));
}

function publisherTranscriptText(raw: string, type: string, url: string) {
  if (type === "text/html") return extractFromHtml(raw, url).normalizedText;
  if (type === "text/vtt" || type === "application/x-subrip") return captionText(raw);
  if (type === "application/json") return transcriptJsonText(raw);
  return extractFromPlainText(raw).normalizedText;
}

async function fetchPublisherTranscript(entry: FeedEntry, preferredLanguage: string) {
  if (!entry.transcripts.length) {
    return { text: null, status: "not_declared", url: null, type: null, language: null, robotsUrl: null };
  }
  const preferred = preferredLanguage.toLowerCase().split("-")[0];
  const links = [...entry.transcripts].sort((left, right) =>
    Number(!(left.language ?? "").toLowerCase().startsWith(preferred)) -
    Number(!(right.language ?? "").toLowerCase().startsWith(preferred)),
  );
  let blocked = false;
  let lastRobotsUrl: string | null = null;
  for (const link of links) {
    const permission = await robotsPermission(link.url);
    lastRobotsUrl = permission.robotsUrl;
    if (!permission.allowed) {
      blocked = true;
      continue;
    }
    try {
      const resource = await fetchText(link.url, [...PODCAST_TRANSCRIPT_TYPES].join(","));
      const text = publisherTranscriptText(resource.text, link.type, resource.url);
      if (!text) continue;
      return {
        text,
        status: "downloaded",
        url: resource.url,
        type: link.type,
        language: link.language,
        robotsUrl: permission.robotsUrl,
      };
    } catch (error) {
      if (error instanceof CollectorHttpError) throw error;
    }
  }
  return {
    text: null,
    status: blocked ? "blocked_by_robots" : "unavailable",
    url: null,
    type: null,
    language: null,
    robotsUrl: lastRobotsUrl,
  };
}

class WebCollectionAdapter implements IntelligenceSourceAdapter {
  private readonly entries = new Map<string, FeedEntry>();

  constructor(private readonly source: CollectionSourceRow) {}

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const config = sourceConfig(this.source);
    let entries: FeedEntry[] = [];
    if (config.feedUrl) {
      const feed = await fetchText(config.feedUrl, "application/atom+xml,application/rss+xml,application/xml,text/xml");
      entries = parseFeed(feed.text, feed.url);
    } else if (config.sitemapUrl) {
      const sitemap = await fetchText(config.sitemapUrl, "application/xml,text/xml");
      entries = parseSitemap(sitemap.text, sitemap.url).map((url) => ({
        id: url,
        url,
        title: null,
        publisher: config.publisher ?? null,
        author: null,
        publishedAt: null,
        summary: null,
        transcripts: [],
      }));
    } else {
      const urls = config.discoverLinks
        ? (
            await Promise.all(
              config.urls.map((url) => discoverPageLinks(url, config.linkPathPatterns)),
            )
          ).flat()
        : config.urls;
      entries = urls.map((url) => ({
        id: url,
        url,
        title: null,
        publisher: config.publisher ?? null,
        author: null,
        publishedAt: null,
        summary: null,
        transcripts: [],
      }));
    }

    const start = Date.parse(input.windowStart);
    const end = Date.parse(input.windowEnd);
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    const eligible = entries.filter((entry) => {
      const published = entry.publishedAt ? Date.parse(entry.publishedAt) : Number.NaN;
      const inWindow = !Number.isFinite(published) || (published >= start && published <= end);
      return inWindow && !seen.has(entry.id);
    });
    for (const entry of eligible) this.entries.set(entry.id, entry);
    const page = eligible.slice(0, DEFAULT_PAGE_LIMIT);
    const complete = eligible.length <= page.length;
    return {
      externalIds: page.map((entry) => entry.id),
      nextCheckpoint: {
        seen_external_ids: [...seen, ...page.map((entry) => entry.id)].slice(-2_000),
        has_more: !complete,
      },
    };
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const entry = this.entries.get(externalId) ?? {
      id: externalId,
      url: externalId,
      title: null,
      publisher: sourceConfig(this.source).publisher ?? null,
      author: null,
      publishedAt: null,
      summary: null,
      transcripts: [],
    };
    const permission = await robotsPermission(entry.url);
    if (!permission.allowed) throw new Error(`robots.txt disallows ${entry.url}`);
    const resource = await fetchText(
      entry.url,
      "text/html,application/xhtml+xml,text/plain,application/xml,text/xml",
    );
    const extracted = resource.contentType.includes("html")
      ? extractFromHtml(resource.text, resource.url)
      : extractFromPlainText(resource.text);
    const config = sourceConfig(this.source);
    const transcript = this.source.source_type === "podcast"
      ? await fetchPublisherTranscript(entry, config.language ?? "en")
      : { text: null, status: "not_applicable", url: null, type: null, language: null, robotsUrl: null };
    const contentText = transcript.text || extracted.normalizedText || entry.summary || "";
    if (!contentText) throw new Error("The source did not contain readable editorial text.");
    const canonicalUrl = normalizeSourceUrl(extracted.canonicalUrl) ?? normalizeSourceUrl(resource.url) ?? entry.url;
    return {
      ownerId,
      sourceType: sourceTypeFor(this.source),
      externalId: entry.id || createHash("sha256").update(canonicalUrl).digest("hex"),
      originalUrl: entry.url,
      canonicalUrl,
      title: extracted.title ?? entry.title,
      authorName: entry.author,
      publisherName: extracted.publisherName ?? entry.publisher ?? this.source.name,
      language: transcript.language ?? extracted.language ?? config.language ?? "en",
      publishedAt: entry.publishedAt,
      contentText,
      summaryShort: entry.summary,
      sourceChannel: this.source.source_type,
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        triggering_research_lead_id: this.source.triggering_research_lead_id,
        robots_status: permission.status,
        robots_url: permission.robotsUrl,
        transcript_status: transcript.status,
        transcript_url: transcript.url,
        transcript_type: transcript.type,
        transcript_language: transcript.language,
        transcript_robots_url: transcript.robotsUrl,
        collector: "web-collector-v2",
      },
    };
  }
}

type YouTubeVideo = {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  contentDetails?: { caption?: string; duration?: string };
  status?: { privacyStatus?: string; license?: string };
};

function safePlatformIdentifier(value: string, label: string, pattern: RegExp) {
  if (!pattern.test(value)) throw new Error(`${label} contains unsupported characters.`);
  return value;
}

function youtubeApiUrl(path: string, parameters: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  url.searchParams.set("key", requiredEnvironment("YOUTUBE_DATA_API_KEY"));
  return url;
}

async function youtubeOAuthAccessToken() {
  const direct = process.env.YOUTUBE_OAUTH_ACCESS_TOKEN?.trim();
  if (direct) return direct;
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  const token = await apiJson<{ access_token?: string }>(
    new URL("https://oauth2.googleapis.com/token"),
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    },
  );
  return token.access_token?.trim() || null;
}

function captionText(value: string) {
  const lines = value
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      line !== "WEBVTT" &&
      !/^\d+$/u.test(line) &&
      !/-->/.test(line) &&
      !/^(?:NOTE|STYLE|REGION)\b/u.test(line),
    )
    .map((line) => line.replace(/<[^>]+>/gu, " "));
  const deduped = lines.filter((line, index) => line !== lines[index - 1]);
  return normalizeTextForStorage(deduped.join(" "));
}

async function officialYouTubeCaption(videoId: string, language: string) {
  const accessToken = await youtubeOAuthAccessToken();
  if (!accessToken) return { text: null, status: "not_configured" as const, language: null };
  try {
    const listUrl = new URL("https://www.googleapis.com/youtube/v3/captions");
    listUrl.searchParams.set("part", "id,snippet");
    listUrl.searchParams.set("videoId", videoId);
    const list = await apiJson<{
      items?: Array<{
        id?: string;
        snippet?: { language?: string; trackKind?: string; isDraft?: boolean };
      }>;
    }>(listUrl, { authorization: `Bearer ${accessToken}` });
    const requested = language.toLowerCase().split("-")[0];
    const tracks = (list.items ?? []).filter((track) => track.id && !track.snippet?.isDraft);
    const selected = tracks
      .filter((track) => (track.snippet?.language ?? "").toLowerCase().startsWith(requested))
      .sort((left, right) => Number(left.snippet?.trackKind === "ASR") - Number(right.snippet?.trackKind === "ASR"))[0]
      ?? tracks.sort((left, right) => Number(left.snippet?.trackKind === "ASR") - Number(right.snippet?.trackKind === "ASR"))[0];
    if (!selected?.id) return { text: null, status: "not_available" as const, language: null };

    const downloadUrl = new URL(
      `https://www.googleapis.com/youtube/v3/captions/${encodeURIComponent(selected.id)}`,
    );
    downloadUrl.searchParams.set("tfmt", "vtt");
    const response = await collectorFetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/vtt" },
      cache: "no-store",
    });
    if (!response.ok) return { text: null, status: "not_permitted" as const, language: null };
    const raw = await readLimitedText(response);
    const text = captionText(raw);
    return {
      text: text || null,
      status: text ? ("downloaded" as const) : ("empty" as const),
      language: selected.snippet?.language ?? null,
    };
  } catch (error) {
    if (error instanceof CollectorHttpError) throw error;
    return { text: null, status: "not_permitted" as const, language: null };
  }
}

class YouTubeApiAdapter implements IntelligenceSourceAdapter {
  private readonly videos = new Map<string, YouTubeVideo>();

  constructor(private readonly source: CollectionSourceRow) {}

  private async uploadsPlaylist(config: SourceConfig) {
    if (config.playlistId) return config.playlistId;
    if (!config.channelId) throw new Error("YouTube source config requires channel_id, playlist_id, or video_ids.");
    const channelId = safePlatformIdentifier(config.channelId, "YouTube channel ID", /^[A-Za-z0-9_-]+$/u);
    const response = await apiJson<{
      items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
    }>(youtubeApiUrl("channels", { part: "contentDetails", id: channelId }));
    const playlist = response.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!playlist) throw new Error("The YouTube channel did not expose an uploads playlist.");
    return playlist;
  }

  private async videoDetails(ids: string[]) {
    if (!ids.length) return [];
    const response = await apiJson<{ items?: YouTubeVideo[] }>(
      youtubeApiUrl("videos", {
        part: "snippet,contentDetails,status",
        id: ids.join(","),
      }),
    );
    return response.items ?? [];
  }

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const config = sourceConfig(this.source);
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    let videos: YouTubeVideo[] = [];
    let nextPageToken: string | null = null;

    if (config.videoIds.length) {
      const ids = config.videoIds
        .map((id) => safePlatformIdentifier(id, "YouTube video ID", /^[A-Za-z0-9_-]{6,32}$/u))
        .filter((id) => !seen.has(id))
        .slice(0, 50);
      videos = await this.videoDetails(ids);
    } else {
      const playlistId = safePlatformIdentifier(
        await this.uploadsPlaylist(config),
        "YouTube playlist ID",
        /^[A-Za-z0-9_-]+$/u,
      );
      const parameters: Record<string, string> = {
        part: "snippet,contentDetails",
        playlistId,
        maxResults: String(DEFAULT_PAGE_LIMIT),
      };
      const pageToken = stringValue(input.checkpoint?.youtube_page_token);
      if (pageToken) parameters.pageToken = pageToken;
      const page = await apiJson<{
        nextPageToken?: string;
        items?: Array<{
          contentDetails?: { videoId?: string; videoPublishedAt?: string };
          snippet?: { publishedAt?: string; title?: string; description?: string; channelTitle?: string; resourceId?: { videoId?: string } };
        }>;
      }>(youtubeApiUrl("playlistItems", parameters));
      nextPageToken = page.nextPageToken ?? null;
      const ids = (page.items ?? [])
        .map((item) => item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId)
        .filter((id): id is string => Boolean(id && !seen.has(id)));
      videos = await this.videoDetails(ids);
    }

    const start = Date.parse(input.windowStart);
    const end = Date.parse(input.windowEnd);
    videos = videos.filter((video) => {
      const published = Date.parse(video.snippet?.publishedAt ?? "");
      return !seen.has(video.id) && (!Number.isFinite(published) || (published >= start && published <= end));
    });
    for (const video of videos) this.videos.set(video.id, video);
    const ids = videos.map((video) => video.id).slice(0, DEFAULT_PAGE_LIMIT);
    return {
      externalIds: ids,
      nextCheckpoint: {
        seen_external_ids: [...seen, ...ids].slice(-10_000),
        youtube_page_token: nextPageToken,
        has_more: Boolean(nextPageToken) || videos.length > ids.length,
      },
    };
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const id = safePlatformIdentifier(externalId, "YouTube video ID", /^[A-Za-z0-9_-]{6,32}$/u);
    const video = this.videos.get(id) ?? (await this.videoDetails([id]))[0];
    if (!video) throw new Error(`YouTube video ${id} was not returned by the official API.`);
    const config = sourceConfig(this.source);
    const language = video.snippet?.defaultLanguage ?? video.snippet?.defaultAudioLanguage ?? config.language ?? "en";
    const captions = config.includeCaptions
      ? await officialYouTubeCaption(id, language)
      : { text: null, status: "disabled" as const, language: null };
    const description = normalizeTextForStorage(video.snippet?.description ?? "");
    const title = normalizeTextForStorage(video.snippet?.title ?? "") || `YouTube video ${id}`;
    const contentText = [title, description, captions.text ? `Official captions:\n${captions.text}` : ""]
      .filter(Boolean)
      .join("\n\n");
    return {
      ownerId,
      sourceType: "youtube_video",
      externalId: id,
      originalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      title,
      authorName: video.snippet?.channelTitle ?? config.publisher ?? this.source.name,
      publisherName: video.snippet?.channelTitle ?? config.publisher ?? this.source.name,
      language,
      publishedAt: safeDate(video.snippet?.publishedAt),
      contentText,
      summaryShort: description.slice(0, 2_000) || null,
      sourceChannel: "youtube_data_api",
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        triggering_research_lead_id: this.source.triggering_research_lead_id,
        youtube_video_id: id,
        youtube_channel_id: video.snippet?.channelId ?? config.channelId ?? null,
        duration: video.contentDetails?.duration ?? null,
        captions_available: video.contentDetails?.caption === "true",
        caption_status: captions.status,
        caption_language: captions.language,
        authority: "specialist",
        api: "youtube-data-api-v3",
        collector: "youtube-official-api-v1",
      },
    };
  }
}

type RedditPost = {
  id: string;
  name?: string;
  title?: string;
  selftext?: string;
  author?: string;
  subreddit?: string;
  permalink?: string;
  url?: string;
  created_utc?: number;
  stickied?: boolean;
};

class RedditApiAdapter implements IntelligenceSourceAdapter {
  private readonly posts = new Map<string, RedditPost>();
  private accessToken: string | null = null;

  constructor(private readonly source: CollectionSourceRow) {}

  private async token() {
    if (this.accessToken) return this.accessToken;
    const clientId = requiredEnvironment("REDDIT_CLIENT_ID");
    const clientSecret = requiredEnvironment("REDDIT_CLIENT_SECRET");
    const result = await apiJson<{ access_token?: string }>(
      new URL("https://www.reddit.com/api/v1/access_token"),
      {
        method: "POST",
        basicAuthorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        body: new URLSearchParams({ grant_type: "client_credentials" }),
      },
    );
    this.accessToken = result.access_token?.trim() || null;
    if (!this.accessToken) throw new Error("Reddit OAuth did not return an access token.");
    return this.accessToken;
  }

  private async listing(url: URL) {
    return apiJson<{
      data?: { after?: string | null; children?: Array<{ data?: RedditPost }> };
    }>(url, { authorization: `Bearer ${await this.token()}` });
  }

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const config = sourceConfig(this.source);
    const subreddit = safePlatformIdentifier(
      config.subreddit ?? "",
      "Subreddit",
      /^[A-Za-z0-9_]{2,32}$/u,
    );
    const url = new URL(`https://oauth.reddit.com/r/${subreddit}/new`);
    url.searchParams.set("limit", String(DEFAULT_PAGE_LIMIT));
    url.searchParams.set("raw_json", "1");
    const after = stringValue(input.checkpoint?.reddit_after);
    if (after) url.searchParams.set("after", safePlatformIdentifier(after, "Reddit cursor", /^t3_[A-Za-z0-9]+$/u));
    const listing = await this.listing(url);
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    const start = Date.parse(input.windowStart);
    const end = Date.parse(input.windowEnd);
    const posts = (listing.data?.children ?? [])
      .map((child) => child.data)
      .filter((post): post is RedditPost => Boolean(post?.id && !seen.has(post.id)))
      .filter((post) => {
        const published = Number(post.created_utc ?? 0) * 1_000;
        return !published || (published >= start && published <= end);
      });
    for (const post of posts) this.posts.set(post.id, post);
    const ids = posts.map((post) => post.id).slice(0, DEFAULT_PAGE_LIMIT);
    return {
      externalIds: ids,
      nextCheckpoint: {
        seen_external_ids: [...seen, ...ids].slice(-10_000),
        reddit_after: listing.data?.after ?? null,
        has_more: Boolean(listing.data?.after) || posts.length > ids.length,
      },
    };
  }

  private async post(externalId: string) {
    const id = safePlatformIdentifier(externalId, "Reddit post ID", /^[A-Za-z0-9]+$/u);
    const existing = this.posts.get(id);
    if (existing) return existing;
    const url = new URL("https://oauth.reddit.com/api/info");
    url.searchParams.set("id", `t3_${id}`);
    return (await this.listing(url)).data?.children?.[0]?.data ?? null;
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const post = await this.post(externalId);
    if (!post) throw new Error(`Reddit post ${externalId} was not returned by the approved API.`);
    const permalink = post.permalink?.startsWith("/") ? post.permalink : `/comments/${post.id}`;
    const canonicalUrl = `https://www.reddit.com${permalink}`;
    const title = normalizeTextForStorage(post.title ?? "") || `Reddit post ${post.id}`;
    const selfText = normalizeTextForStorage(post.selftext ?? "");
    return {
      ownerId,
      sourceType: "reddit_post",
      externalId: post.id,
      originalUrl: canonicalUrl,
      canonicalUrl,
      title,
      authorName: post.author ?? null,
      publisherName: post.subreddit ? `r/${post.subreddit}` : this.source.name,
      language: sourceConfig(this.source).language ?? "en",
      publishedAt: post.created_utc ? new Date(post.created_utc * 1_000).toISOString() : null,
      contentText: [title, selfText].filter(Boolean).join("\n\n"),
      summaryShort: selfText.slice(0, 2_000) || null,
      sourceChannel: "reddit_oauth_api",
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        triggering_research_lead_id: this.source.triggering_research_lead_id,
        reddit_post_id: post.id,
        linked_url: post.url ?? null,
        stickied: post.stickied === true,
        authority: "community",
        api: "reddit-oauth-api",
        collector: "reddit-approved-api-v1",
      },
    };
  }
}

type XPost = {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  lang?: string;
  note_tweet?: { text?: string };
};

class XApiAdapter implements IntelligenceSourceAdapter {
  private readonly posts = new Map<string, XPost>();

  constructor(private readonly source: CollectionSourceRow) {}

  private async request(url: URL) {
    return apiJson<{
      data?: XPost | XPost[];
      meta?: { next_token?: string };
      includes?: { users?: Array<{ id?: string; name?: string; username?: string }> };
    }>(url, { authorization: `Bearer ${requiredEnvironment("X_API_BEARER_TOKEN")}` });
  }

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const config = sourceConfig(this.source);
    const userId = safePlatformIdentifier(config.xUserId ?? "", "X user ID", /^\d+$/u);
    const url = new URL(`https://api.x.com/2/users/${userId}/tweets`);
    url.searchParams.set("max_results", String(DEFAULT_PAGE_LIMIT));
    url.searchParams.set("start_time", new Date(input.windowStart).toISOString());
    url.searchParams.set("end_time", new Date(input.windowEnd).toISOString());
    url.searchParams.set("exclude", "retweets,replies");
    url.searchParams.set("tweet.fields", "author_id,created_at,lang,note_tweet");
    const nextToken = stringValue(input.checkpoint?.x_next_token);
    if (nextToken) url.searchParams.set("pagination_token", nextToken);
    const response = await this.request(url);
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    const posts = (Array.isArray(response.data) ? response.data : response.data ? [response.data] : [])
      .filter((post) => post.id && !seen.has(post.id));
    for (const post of posts) this.posts.set(post.id, post);
    const ids = posts.map((post) => post.id).slice(0, DEFAULT_PAGE_LIMIT);
    return {
      externalIds: ids,
      nextCheckpoint: {
        seen_external_ids: [...seen, ...ids].slice(-10_000),
        x_next_token: response.meta?.next_token ?? null,
        has_more: Boolean(response.meta?.next_token) || posts.length > ids.length,
      },
    };
  }

  private async post(externalId: string) {
    const id = safePlatformIdentifier(externalId, "X post ID", /^\d+$/u);
    const existing = this.posts.get(id);
    if (existing) return { post: existing, username: sourceConfig(this.source).xUsername };
    const url = new URL(`https://api.x.com/2/tweets/${id}`);
    url.searchParams.set("tweet.fields", "author_id,created_at,lang,note_tweet");
    url.searchParams.set("expansions", "author_id");
    url.searchParams.set("user.fields", "name,username");
    const response = await this.request(url);
    const post = Array.isArray(response.data) ? response.data[0] : response.data;
    return { post: post ?? null, username: response.includes?.users?.[0]?.username ?? sourceConfig(this.source).xUsername };
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const { post, username } = await this.post(externalId);
    if (!post) throw new Error(`X post ${externalId} was not returned by the approved API.`);
    const text = normalizeTextForStorage(post.note_tweet?.text ?? post.text ?? "");
    if (!text) throw new Error("The X API returned a post with no readable text.");
    const canonicalUrl = username
      ? `https://x.com/${encodeURIComponent(username)}/status/${post.id}`
      : `https://x.com/i/web/status/${post.id}`;
    return {
      ownerId,
      sourceType: "social_post",
      externalId: post.id,
      originalUrl: canonicalUrl,
      canonicalUrl,
      title: text.slice(0, 180),
      authorName: username ? `@${username}` : null,
      publisherName: username ? `@${username}` : this.source.name,
      language: post.lang ?? sourceConfig(this.source).language ?? "en",
      publishedAt: safeDate(post.created_at),
      contentText: text,
      summaryShort: text.slice(0, 2_000),
      sourceChannel: "x_api_v2",
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        triggering_research_lead_id: this.source.triggering_research_lead_id,
        x_post_id: post.id,
        x_author_id: post.author_id ?? null,
        authority: "community",
        api: "x-api-v2",
        collector: "x-approved-api-v1",
      },
    };
  }
}

type OcdsReference = { id?: string; name?: string };
type OcdsValue = { amount?: number; currency?: string };
type OcdsPeriod = { startDate?: string; endDate?: string; durationInDays?: number };
type OcdsDocument = {
  id?: string;
  documentType?: string;
  noticeType?: string;
  title?: string;
  description?: string;
  url?: string;
  datePublished?: string;
};
type OcdsItem = {
  id?: string;
  description?: string;
  classification?: { id?: string; scheme?: string; description?: string };
  additionalClassifications?: Array<{ id?: string; scheme?: string; description?: string }>;
};
type OcdsMilestone = {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  dueDate?: string;
  dateMet?: string;
};
type OcdsRelease = {
  id?: string;
  ocid?: string;
  date?: string;
  tag?: string[];
  initiationType?: string;
  buyer?: OcdsReference;
  planning?: {
    rationale?: string;
    budget?: { description?: string; amount?: OcdsValue; project?: string; projectID?: string };
    documents?: OcdsDocument[];
    milestones?: OcdsMilestone[];
  };
  tender?: {
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    procurementMethod?: string;
    procurementMethodDetails?: string;
    mainProcurementCategory?: string;
    value?: OcdsValue;
    minValue?: OcdsValue;
    tenderPeriod?: OcdsPeriod;
    enquiryPeriod?: OcdsPeriod;
    awardPeriod?: OcdsPeriod;
    items?: OcdsItem[];
    documents?: OcdsDocument[];
    milestones?: OcdsMilestone[];
  };
  awards?: Array<{
    id?: string;
    title?: string;
    description?: string;
    status?: string;
    date?: string;
    value?: OcdsValue;
    suppliers?: OcdsReference[];
    items?: OcdsItem[];
    documents?: OcdsDocument[];
  }>;
  contracts?: Array<{
    id?: string;
    awardID?: string;
    title?: string;
    description?: string;
    status?: string;
    value?: OcdsValue;
    period?: OcdsPeriod;
    dateSigned?: string;
    documents?: OcdsDocument[];
  }>;
  parties?: Array<OcdsReference & { roles?: string[] }>;
  relatedProcesses?: Array<{ id?: string; relationship?: string[]; title?: string; scheme?: string; identifier?: string; uri?: string }>;
};

type FindTenderReleasePackage = {
  version?: string;
  publishedDate?: string;
  publisher?: { name?: string; uri?: string };
  links?: { next?: string };
  releases?: OcdsRelease[];
};

const FIND_TENDER_API_URL =
  "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages";

function findTenderApiUrl(source: CollectionSourceRow) {
  const configured = sourceConfig(source).apiUrl ?? FIND_TENDER_API_URL;
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.find-tender.service.gov.uk" ||
    url.pathname.replace(/\/$/u, "") !== "/api/1.0/ocdsReleasePackages"
  ) {
    throw new Error("Find a Tender must use the verified official OCDS release-package endpoint.");
  }
  url.pathname = url.pathname.replace(/\/$/u, "");
  url.search = "";
  return url;
}

function findTenderTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Find a Tender collection window is invalid.");
  return date.toISOString().slice(0, 19);
}

function findTenderCursor(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9=]{1,300}$/u.test(value)) {
    throw new Error("Find a Tender cursor is invalid.");
  }
  return value;
}

function nextFindTenderCursor(value: string | undefined, apiUrl: URL) {
  if (!value) return null;
  try {
    const next = new URL(value, apiUrl);
    if (next.origin !== apiUrl.origin || next.pathname.replace(/\/$/u, "") !== apiUrl.pathname) {
      return null;
    }
    return findTenderCursor(next.searchParams.get("cursor"));
  } catch {
    return null;
  }
}

function ocdsMoney(value: OcdsValue | undefined) {
  if (!Number.isFinite(value?.amount)) return null;
  return `${value?.amount} ${value?.currency ?? ""}`.trim();
}

function ocdsPeriod(value: OcdsPeriod | undefined) {
  if (!value) return null;
  return [value.startDate, value.endDate]
    .filter((part): part is string => Boolean(part))
    .join(" to ") || (value.durationInDays ? `${value.durationInDays} days` : null);
}

function addOcdsLine(lines: string[], label: string, value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return;
  const normalized = normalizeTextForStorage(String(value));
  if (normalized) lines.push(`${label}: ${normalized}`);
}

function addOcdsItems(lines: string[], items: OcdsItem[] | undefined, label: string) {
  for (const item of items ?? []) {
    const classifications = [item.classification, ...(item.additionalClassifications ?? [])]
      .filter((classification): classification is NonNullable<typeof classification> => Boolean(classification))
      .map((classification) =>
        [classification.scheme, classification.id, classification.description].filter(Boolean).join(" "),
      )
      .filter(Boolean)
      .join("; ");
    addOcdsLine(lines, label, [item.description, classifications].filter(Boolean).join(" — "));
  }
}

function addOcdsMilestones(lines: string[], milestones: OcdsMilestone[] | undefined) {
  for (const milestone of milestones ?? []) {
    addOcdsLine(
      lines,
      "Milestone",
      [
        milestone.title,
        milestone.description,
        milestone.type,
        milestone.status,
        milestone.dueDate ? `due ${milestone.dueDate}` : null,
        milestone.dateMet ? `met ${milestone.dateMet}` : null,
      ].filter(Boolean).join(" — "),
    );
  }
}

function findTenderDocuments(release: OcdsRelease) {
  return [
    ...(release.planning?.documents ?? []),
    ...(release.tender?.documents ?? []),
    ...(release.awards ?? []).flatMap((award) => award.documents ?? []),
    ...(release.contracts ?? []).flatMap((contract) => contract.documents ?? []),
  ];
}

function findTenderNoticeUrl(release: OcdsRelease) {
  for (const document of findTenderDocuments(release)) {
    if (!document.url) continue;
    try {
      const url = new URL(document.url);
      if (
        url.protocol === "https:" &&
        url.hostname === "www.find-tender.service.gov.uk" &&
        /^\/Notice\/\d{6}-\d{4}\/?$/u.test(url.pathname)
      ) {
        return normalizeSourceUrl(url.toString()) ?? url.toString();
      }
    } catch {
      // Ignore malformed document links from an otherwise usable release.
    }
  }
  return `https://www.find-tender.service.gov.uk/Notice/${encodeURIComponent(release.id ?? "")}`;
}

function findTenderReleaseText(release: OcdsRelease) {
  const lines: string[] = [];
  addOcdsLine(lines, "Notice ID", release.id);
  addOcdsLine(lines, "Procurement identifier", release.ocid);
  addOcdsLine(lines, "Published", release.date);
  addOcdsLine(lines, "Release stage", release.tag?.join(", "));
  addOcdsLine(lines, "Buyer", release.buyer?.name);
  addOcdsLine(lines, "Planning rationale", release.planning?.rationale);
  addOcdsLine(lines, "Budget description", release.planning?.budget?.description);
  addOcdsLine(lines, "Budget", ocdsMoney(release.planning?.budget?.amount));
  addOcdsLine(lines, "Project", release.planning?.budget?.project);
  addOcdsLine(lines, "Project ID", release.planning?.budget?.projectID);
  addOcdsLine(lines, "Reference", release.tender?.id);
  addOcdsLine(lines, "Title", release.tender?.title);
  addOcdsLine(lines, "Description", release.tender?.description);
  addOcdsLine(lines, "Tender status", release.tender?.status);
  addOcdsLine(lines, "Procurement method", release.tender?.procurementMethodDetails ?? release.tender?.procurementMethod);
  addOcdsLine(lines, "Procurement category", release.tender?.mainProcurementCategory);
  addOcdsLine(lines, "Estimated value", ocdsMoney(release.tender?.value ?? release.tender?.minValue));
  addOcdsLine(lines, "Tender period", ocdsPeriod(release.tender?.tenderPeriod));
  addOcdsLine(lines, "Enquiry period", ocdsPeriod(release.tender?.enquiryPeriod));
  addOcdsLine(lines, "Award period", ocdsPeriod(release.tender?.awardPeriod));
  addOcdsItems(lines, release.tender?.items, "Tender item");
  addOcdsMilestones(lines, release.planning?.milestones);
  addOcdsMilestones(lines, release.tender?.milestones);

  for (const award of release.awards ?? []) {
    addOcdsLine(lines, "Award", [award.title, award.description].filter(Boolean).join(" — "));
    addOcdsLine(lines, "Award status", award.status);
    addOcdsLine(lines, "Award date", award.date);
    addOcdsLine(lines, "Award value", ocdsMoney(award.value));
    addOcdsLine(lines, "Supplier", award.suppliers?.map((supplier) => supplier.name).filter(Boolean).join(", "));
    addOcdsItems(lines, award.items, "Award item");
  }
  for (const contract of release.contracts ?? []) {
    addOcdsLine(lines, "Contract", [contract.title, contract.description].filter(Boolean).join(" — "));
    addOcdsLine(lines, "Contract status", contract.status);
    addOcdsLine(lines, "Contract value", ocdsMoney(contract.value));
    addOcdsLine(lines, "Contract period", ocdsPeriod(contract.period));
    addOcdsLine(lines, "Contract signed", contract.dateSigned);
  }
  for (const process of release.relatedProcesses ?? []) {
    addOcdsLine(
      lines,
      "Related process",
      [process.title, process.relationship?.join(", "), process.identifier, process.uri].filter(Boolean).join(" — "),
    );
  }
  for (const document of findTenderDocuments(release)) {
    addOcdsLine(
      lines,
      "Official document",
      [document.documentType, document.noticeType, document.title, document.description, document.url]
        .filter(Boolean)
        .join(" — "),
    );
  }
  return lines.join("\n");
}

function findTenderSummary(release: OcdsRelease) {
  return normalizeTextForStorage(
    release.tender?.description ??
    release.planning?.rationale ??
    release.awards?.find((award) => award.description)?.description ??
    release.contracts?.find((contract) => contract.description)?.description ??
    "",
  ).slice(0, 2_000) || null;
}

class FindTenderOcdsAdapter implements IntelligenceSourceAdapter {
  private readonly releases = new Map<string, { release: OcdsRelease; publisher: string | null }>();

  constructor(private readonly source: CollectionSourceRow) {}

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const apiUrl = findTenderApiUrl(this.source);
    const cursor = findTenderCursor(input.checkpoint?.find_tender_cursor);
    const start = cursor
      ? stringValue(input.checkpoint?.find_tender_window_start) ?? findTenderTimestamp(input.windowStart)
      : findTenderTimestamp(input.windowStart);
    const end = cursor
      ? stringValue(input.checkpoint?.find_tender_window_end) ?? findTenderTimestamp(input.windowEnd)
      : findTenderTimestamp(input.windowEnd);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u.test(start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u.test(end)) {
      throw new Error("Find a Tender checkpoint window is invalid.");
    }
    apiUrl.searchParams.set("limit", String(DEFAULT_PAGE_LIMIT));
    apiUrl.searchParams.set("updatedFrom", start);
    apiUrl.searchParams.set("updatedTo", end);
    if (cursor) apiUrl.searchParams.set("cursor", cursor);
    const result = await apiJson<FindTenderReleasePackage>(apiUrl);
    const publisher = result.publisher?.name?.trim() || null;
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    const releases = (result.releases ?? []).filter((release): release is OcdsRelease & { id: string } =>
      Boolean(release.id && /^\d{6}-\d{4}$/u.test(release.id) && !seen.has(release.id)),
    );
    for (const release of releases) this.releases.set(release.id, { release, publisher });
    const ids = releases.map((release) => release.id).slice(0, DEFAULT_PAGE_LIMIT);
    const nextCursor = nextFindTenderCursor(result.links?.next, findTenderApiUrl(this.source));
    return {
      externalIds: ids,
      nextCheckpoint: {
        seen_external_ids: [...seen, ...ids].slice(-10_000),
        find_tender_cursor: nextCursor,
        find_tender_window_start: nextCursor ? start : null,
        find_tender_window_end: nextCursor ? end : null,
        has_more: Boolean(nextCursor) || releases.length > ids.length,
        api_version: result.version ?? "1.1",
      },
    };
  }

  private async release(externalId: string) {
    if (!/^\d{6}-\d{4}$/u.test(externalId)) throw new Error("Find a Tender notice ID is invalid.");
    const existing = this.releases.get(externalId);
    if (existing) return existing;
    const url = findTenderApiUrl(this.source);
    url.pathname = `${url.pathname}/${encodeURIComponent(externalId)}`;
    const result = await apiJson<FindTenderReleasePackage>(url);
    const release = (result.releases ?? []).find((item) => item.id === externalId);
    if (!release) throw new Error(`Find a Tender notice ${externalId} was not returned by the official API.`);
    return { release, publisher: result.publisher?.name?.trim() || null };
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const { release, publisher } = await this.release(externalId);
    const title = normalizeTextForStorage(
      release.tender?.title ??
      release.awards?.find((award) => award.title)?.title ??
      release.contracts?.find((contract) => contract.title)?.title ??
      `Find a Tender notice ${externalId}`,
    );
    const contentText = findTenderReleaseText(release);
    if (!contentText) throw new Error("Find a Tender returned an empty OCDS release.");
    const tags = release.tag ?? [];
    return {
      ownerId,
      sourceType: "procurement_notice",
      externalId,
      originalUrl: findTenderNoticeUrl(release),
      canonicalUrl: findTenderNoticeUrl(release),
      title,
      authorName: release.buyer?.name ?? null,
      publisherName: publisher ?? "UK Cabinet Office — Find a Tender",
      language: "en",
      publishedAt: safeDate(release.date),
      contentText,
      summaryShort: findTenderSummary(release),
      sourceChannel: "find_a_tender_ocds",
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        triggering_research_lead_id: this.source.triggering_research_lead_id,
        ocid: release.ocid ?? null,
        notice_id: release.id ?? externalId,
        procurement_reference: release.tender?.id ?? null,
        buyer: release.buyer?.name ?? null,
        release_tags: tags,
        event_type_hint: tags.includes("award") || tags.includes("contract") ? "award" : "procurement_notice",
        authority: "official",
        jurisdiction: "United Kingdom",
        api: "find-a-tender-ocds-release-packages-1.0",
        ocds_version: "1.1.5",
        collector: "find-a-tender-ocds-v1",
      },
    };
  }
}

type TedNoticeLinks = Partial<Record<"xml" | "pdf" | "pdfs" | "html" | "htmlDirect", Record<string, string>>>;
type TedNotice = {
  "publication-number"?: string;
  "publication-date"?: string;
  "notice-title"?: unknown;
  "buyer-name"?: unknown;
  "notice-type"?: string;
  "notice-subtype"?: string;
  "form-type"?: string;
  "procedure-identifier"?: string;
  "description-lot"?: unknown;
  "main-classification-proc"?: string[];
  "buyer-country"?: string[];
  "winner-name"?: unknown;
  "estimated-value-proc"?: number;
  "estimated-value-cur-proc"?: string;
  "estimated-value-lot"?: number[];
  "estimated-value-cur-lot"?: string[];
  "result-value-notice"?: number;
  "result-value-cur-notice"?: string;
  "deadline-receipt-tender-date-lot"?: string[];
  "contract-nature-main-proc"?: string[];
  links?: TedNoticeLinks;
};

type TedSearchResponse = {
  notices?: TedNotice[];
  totalNoticeCount?: number | null;
  iterationNextToken?: string | null;
  timedOut?: boolean;
};

const TED_SEARCH_API_URL = "https://api.ted.europa.eu/v3/notices/search";
const TED_DEFAULT_EXPERT_QUERY = "main-classification-proc=(35* OR 734* OR 7522*)";
const TED_SEARCH_FIELDS = [
  "publication-number",
  "publication-date",
  "notice-title",
  "buyer-name",
  "notice-type",
  "notice-subtype",
  "form-type",
  "procedure-identifier",
  "description-lot",
  "main-classification-proc",
  "buyer-country",
  "winner-name",
  "estimated-value-proc",
  "estimated-value-cur-proc",
  "estimated-value-lot",
  "estimated-value-cur-lot",
  "result-value-notice",
  "result-value-cur-notice",
  "deadline-receipt-tender-date-lot",
  "contract-nature-main-proc",
  "links",
] as const;

function tedSearchApiUrl(source: CollectionSourceRow) {
  const configured = sourceConfig(source).apiUrl ?? TED_SEARCH_API_URL;
  const url = new URL(configured);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.ted.europa.eu" ||
    url.pathname.replace(/\/$/u, "") !== "/v3/notices/search"
  ) {
    throw new Error("TED must use the verified official v3 Search API endpoint.");
  }
  url.pathname = url.pathname.replace(/\/$/u, "");
  url.search = "";
  return url;
}

function tedQueryDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("TED collection window is invalid.");
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function tedCheckpointDate(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !/^\d{8}$/u.test(value)) {
    throw new Error("TED checkpoint date is invalid.");
  }
  return value;
}

function tedIterationToken(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 20_000 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error("TED iteration token is invalid.");
  }
  return value;
}

function tedExpertQuery(source: CollectionSourceRow, checkpoint?: Record<string, unknown>) {
  const checkpointQuery = stringValue(checkpoint?.ted_expert_query);
  const query = checkpointQuery ?? sourceConfig(source).expertQuery ?? TED_DEFAULT_EXPERT_QUERY;
  if (query.length > 2_000 || /[\u0000-\u001f\u007f]/u.test(query) || /\bSORT\s+BY\b/iu.test(query)) {
    throw new Error("TED expert query is invalid.");
  }
  return query;
}

function tedLocalizedValues(value: unknown) {
  const collect = (candidate: unknown) => {
    if (typeof candidate === "string") return [normalizeTextForStorage(candidate)].filter(Boolean);
    if (Array.isArray(candidate)) {
      return candidate.flatMap((item) => typeof item === "string" ? [normalizeTextForStorage(item)] : []).filter(Boolean);
    }
    return [];
  };
  if (typeof value === "string" || Array.isArray(value)) return { values: collect(value), language: null };
  if (!value || typeof value !== "object") return { values: [] as string[], language: null };
  const entries = Object.entries(value);
  const preferred = entries.find(([language]) => ["eng", "en"].includes(language.toLowerCase()));
  const selected = preferred ?? entries.find(([, candidate]) => collect(candidate).length > 0);
  return selected
    ? { values: collect(selected[1]), language: selected[0].toLowerCase() }
    : { values: [] as string[], language: null };
}

function tedArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => typeof item === "string" || typeof item === "number" ? [String(item)] : [])
    : typeof value === "string" || typeof value === "number"
      ? [String(value)]
      : [];
}

function tedOfficialLink(notice: TedNotice) {
  const groups: Array<keyof TedNoticeLinks> = ["html", "htmlDirect", "xml"];
  for (const group of groups) {
    const links = notice.links?.[group];
    if (!links) continue;
    const entry = Object.entries(links).find(([language]) => language.toUpperCase() === "ENG") ?? Object.entries(links)[0];
    if (!entry?.[1]) continue;
    try {
      const url = new URL(entry[1]);
      if (url.protocol === "https:" && url.hostname === "ted.europa.eu") {
        return normalizeSourceUrl(url.toString()) ?? url.toString();
      }
    } catch {
      // Ignore malformed links from an otherwise usable notice.
    }
  }
  return `https://ted.europa.eu/en/notice/${encodeURIComponent(notice["publication-number"] ?? "")}`;
}

function tedPublishedAt(value: string | undefined) {
  if (!value) return null;
  const zonedDate = value.match(/^(\d{4}-\d{2}-\d{2})[+-]\d{2}:\d{2}$/u);
  if (zonedDate) return safeDate(`${zonedDate[1]}T00:00:00.000Z`);
  const plainDate = value.match(/^\d{4}-\d{2}-\d{2}$/u);
  if (plainDate) return safeDate(`${value}T00:00:00.000Z`);
  return safeDate(value);
}

function tedNoticeText(notice: TedNotice) {
  const lines: string[] = [];
  const titles = tedLocalizedValues(notice["notice-title"]);
  const buyers = tedLocalizedValues(notice["buyer-name"]);
  const descriptions = tedLocalizedValues(notice["description-lot"]);
  const winners = tedLocalizedValues(notice["winner-name"]);
  addOcdsLine(lines, "Publication number", notice["publication-number"]);
  addOcdsLine(lines, "Publication date", notice["publication-date"]);
  addOcdsLine(lines, "Notice type", notice["notice-type"]);
  addOcdsLine(lines, "Notice subtype", notice["notice-subtype"]);
  addOcdsLine(lines, "Form type", notice["form-type"]);
  addOcdsLine(lines, "Procedure identifier", notice["procedure-identifier"]);
  addOcdsLine(lines, "Title", titles.values.join("; "));
  addOcdsLine(lines, "Buyer", buyers.values.join("; "));
  for (const description of descriptions.values) addOcdsLine(lines, "Description", description);
  addOcdsLine(lines, "Main CPV classification", tedArray(notice["main-classification-proc"]).join(", "));
  addOcdsLine(lines, "Buyer country", tedArray(notice["buyer-country"]).join(", "));
  addOcdsLine(lines, "Winner", winners.values.join("; "));
  addOcdsLine(
    lines,
    "Estimated procedure value",
    [notice["estimated-value-proc"], notice["estimated-value-cur-proc"]].filter((part) => part !== undefined).join(" "),
  );
  const lotValues = tedArray(notice["estimated-value-lot"]);
  const lotCurrencies = tedArray(notice["estimated-value-cur-lot"]);
  for (const [index, value] of lotValues.entries()) {
    addOcdsLine(lines, "Estimated lot value", [value, lotCurrencies[index] ?? lotCurrencies[0]].filter(Boolean).join(" "));
  }
  addOcdsLine(
    lines,
    "Result value",
    [notice["result-value-notice"], notice["result-value-cur-notice"]].filter((part) => part !== undefined).join(" "),
  );
  addOcdsLine(lines, "Tender deadline", tedArray(notice["deadline-receipt-tender-date-lot"]).join(", "));
  addOcdsLine(lines, "Contract nature", tedArray(notice["contract-nature-main-proc"]).join(", "));
  addOcdsLine(lines, "Official notice", tedOfficialLink(notice));
  return lines.join("\n");
}

class TedSearchAdapter implements IntelligenceSourceAdapter {
  private readonly notices = new Map<string, TedNotice>();

  constructor(private readonly source: CollectionSourceRow) {}

  private async search(body: Record<string, unknown>) {
    const response = await apiJson<TedSearchResponse>(tedSearchApiUrl(this.source), {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(body),
    });
    if (response.timedOut) {
      throw new CollectorHttpError("TED Search API timed out.", { transient: true });
    }
    return response;
  }

  private fields() {
    return [...TED_SEARCH_FIELDS];
  }

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const token = tedIterationToken(input.checkpoint?.ted_iteration_token);
    const start = tedCheckpointDate(input.checkpoint?.ted_window_start, tedQueryDate(input.windowStart));
    const end = tedCheckpointDate(input.checkpoint?.ted_window_end, tedQueryDate(input.windowEnd));
    const expertQuery = tedExpertQuery(this.source, token ? input.checkpoint : undefined);
    const body: Record<string, unknown> = {
      query: `publication-date>=${start} AND publication-date<=${end} AND (${expertQuery}) SORT BY publication-date`,
      fields: this.fields(),
      limit: DEFAULT_PAGE_LIMIT,
      scope: "ALL",
      checkQuerySyntax: false,
      paginationMode: "ITERATION",
      onlyLatestVersions: true,
    };
    if (token) body.iterationNextToken = token;
    const response = await this.search(body);
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    const notices = (response.notices ?? []).filter((notice): notice is TedNotice & { "publication-number": string } => {
      const id = notice["publication-number"];
      return Boolean(id && /^\d{6}-\d{4}$/u.test(id) && !seen.has(id));
    });
    for (const notice of notices) this.notices.set(notice["publication-number"], notice);
    const ids = notices.map((notice) => notice["publication-number"]).slice(0, DEFAULT_PAGE_LIMIT);
    const nextToken = (response.notices?.length ?? 0) > 0
      ? tedIterationToken(response.iterationNextToken)
      : null;
    return {
      externalIds: ids,
      nextCheckpoint: {
        seen_external_ids: [...seen, ...ids].slice(-10_000),
        ted_iteration_token: nextToken,
        ted_window_start: nextToken ? start : null,
        ted_window_end: nextToken ? end : null,
        ted_expert_query: nextToken ? expertQuery : null,
        total_notice_count: response.totalNoticeCount ?? null,
        has_more: Boolean(nextToken),
        pagination_mode: "ITERATION",
      },
    };
  }

  private async notice(externalId: string) {
    if (!/^\d{6}-\d{4}$/u.test(externalId)) throw new Error("TED publication number is invalid.");
    const existing = this.notices.get(externalId);
    if (existing) return existing;
    const response = await this.search({
      query: `publication-number=${externalId}`,
      fields: this.fields(),
      page: 1,
      limit: 1,
      scope: "ALL",
      checkQuerySyntax: false,
      paginationMode: "PAGE_NUMBER",
      onlyLatestVersions: true,
    });
    const notice = (response.notices ?? []).find((item) => item["publication-number"] === externalId);
    if (!notice) throw new Error(`TED notice ${externalId} was not returned by the official Search API.`);
    return notice;
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const notice = await this.notice(externalId);
    const titles = tedLocalizedValues(notice["notice-title"]);
    const buyers = tedLocalizedValues(notice["buyer-name"]);
    const descriptions = tedLocalizedValues(notice["description-lot"]);
    const winners = tedLocalizedValues(notice["winner-name"]);
    const canonicalUrl = tedOfficialLink(notice);
    const contentText = tedNoticeText(notice);
    if (!contentText) throw new Error("TED returned an empty notice record.");
    const noticeType = notice["notice-type"] ?? null;
    return {
      ownerId,
      sourceType: "procurement_notice",
      externalId,
      originalUrl: canonicalUrl,
      canonicalUrl,
      title: titles.values[0] ?? `TED notice ${externalId}`,
      authorName: buyers.values[0] ?? null,
      publisherName: "Tenders Electronic Daily (TED)",
      language: titles.language === "eng" ? "en" : titles.language,
      publishedAt: tedPublishedAt(notice["publication-date"]),
      contentText,
      summaryShort: descriptions.values.join(" ").slice(0, 2_000) || null,
      sourceChannel: "ted_search_api_v3",
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        triggering_research_lead_id: this.source.triggering_research_lead_id,
        publication_number: notice["publication-number"] ?? externalId,
        procedure_identifier: notice["procedure-identifier"] ?? null,
        notice_type: noticeType,
        notice_subtype: notice["notice-subtype"] ?? null,
        form_type: notice["form-type"] ?? null,
        buyer: buyers.values,
        buyer_country: notice["buyer-country"] ?? [],
        winner: winners.values,
        main_classification: notice["main-classification-proc"] ?? [],
        event_type_hint: winners.values.length || notice["result-value-notice"] !== undefined ? "award" : "procurement_notice",
        authority: "official",
        jurisdiction: "European Union",
        api: "ted-search-api-v3",
        collector: "ted-search-api-v3",
      },
    };
  }
}

class CanadaBuysContractAdapter implements IntelligenceSourceAdapter {
  private readonly rows = new Map<string, Record<string, string>>();

  constructor(private readonly source: CollectionSourceRow) {}

  async discover(input: {
    windowStart: string;
    windowEnd: string;
    checkpoint?: Record<string, unknown>;
  }): Promise<SourceDiscoveryPage> {
    const config = sourceConfig(this.source);
    const resourceUrl =
      config.datasetUrl ??
      "https://canadabuys.canada.ca/opendata/pub/2026-2027-contractHistory-contratsOctroyes.csv";
    const permission = await robotsPermission(resourceUrl);
    if (!permission.allowed) throw new Error(`robots.txt disallows ${resourceUrl}`);
    const resource = await fetchText(resourceUrl, "text/csv,application/octet-stream");
    const start = Date.parse(input.windowStart);
    const end = Date.parse(input.windowEnd);
    const seen = new Set(stringArray(input.checkpoint?.seen_external_ids));
    const candidates: string[] = [];
    for (const row of csvRecords(resource.text)) {
      const date = safeDate(
        row["publicationDate-datePublication"] ||
          row["contractAwardDate-dateAttributionContrat"] ||
          row["amendmentDate-dateModification"],
      );
      const timestamp = date ? Date.parse(date) : Number.NaN;
      if (Number.isFinite(timestamp) && (timestamp < start || timestamp > end)) continue;
      const reference =
        row["referenceNumber-numeroReference"] ||
        row["contractNumber-numeroContrat"] ||
        row["procurementNumber-numeroApprovisionnement"];
      if (!reference) continue;
      const externalId = [reference, row["amendmentNumber-numeroModification"] || "000"].join(":");
      if (seen.has(externalId)) continue;
      this.rows.set(externalId, row);
      candidates.push(externalId);
    }
    const page = candidates.slice(0, DEFAULT_PAGE_LIMIT);
    return {
      externalIds: page,
      nextCheckpoint: {
        seen_external_ids: [...seen, ...page].slice(-10_000),
        has_more: candidates.length > page.length,
        dataset_url: resourceUrl,
        dataset_id: config.datasetId ?? "4fe645a1-ffcd-40c1-9385-2c771be956a4",
      },
    };
  }

  async fetch(externalId: string, ownerId: string): Promise<IntelligenceDocumentEnvelope> {
    const row = this.rows.get(externalId);
    if (!row) throw new Error(`CanadaBuys record ${externalId} is not in the active discovery page.`);
    const title = row["title-titre-eng"] || row["gsinDescription-nibsDescription-eng"] || externalId;
    const awardDate = safeDate(
      row["contractAwardDate-dateAttributionContrat"] || row["publicationDate-datePublication"],
    );
    const content = Object.entries(row)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => `${key.split("-")[0]}: ${normalizeTextForStorage(value)}`)
      .join("\n");
    const datasetPage =
      "https://open.canada.ca/data/en/dataset/4fe645a1-ffcd-40c1-9385-2c771be956a4";
    return {
      ownerId,
      sourceType: "procurement_notice",
      externalId,
      originalUrl: sourceConfig(this.source).datasetUrl ?? datasetPage,
      canonicalUrl: datasetPage,
      title,
      authorName: "Government of Canada",
      publisherName: "CanadaBuys",
      language: "en",
      publishedAt: awardDate,
      contentText: content,
      summaryShort: [
        row["contractStatus-statutContrat-eng"],
        row["contractAmount-montantContrat"]
          ? `${row["contractAmount-montantContrat"]} ${row["contractCurrency-contratMonnaie"] || "CAD"}`
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
      sourceChannel: "canadabuys_open_data",
      metadata: {
        source_id: this.source.id,
        source_cohort: this.source.cohort,
        measurement_active_from: this.source.measurement_active_from,
        discovery_origin: this.source.discovery_origin,
        dataset_id: sourceConfig(this.source).datasetId ?? "4fe645a1-ffcd-40c1-9385-2c771be956a4",
        procurement_reference: row["referenceNumber-numeroReference"],
        procurement_number: row["procurementNumber-numeroApprovisionnement"],
        solicitation_number: row["solicitationNumber-numeroSollicitation"],
        contract_number: row["contractNumber-numeroContrat"],
        event_type_hint: "award",
        authority: "official",
        collector: "canadabuys-contract-history-v1",
      },
    };
  }
}

export function createSourceAdapter(source: CollectionSourceRow): IntelligenceSourceAdapter {
  if (
    source.source_type === "procurement_portal" &&
    sourceConfig(source).adapter === "uk_find_a_tender_ocds"
  ) {
    return new FindTenderOcdsAdapter(source);
  }
  if (
    source.source_type === "procurement_portal" &&
    sourceConfig(source).adapter === "eu_ted_search_v3"
  ) {
    return new TedSearchAdapter(source);
  }
  if (
    source.source_type === "procurement_portal" &&
    sourceConfig(source).adapter === "manual_entry_point_only"
  ) {
    throw new Error(
      "This procurement source is an inactive entry-point candidate; no verified scheduled adapter is enabled.",
    );
  }
  if (
    source.source_type === "procurement_portal" &&
    sourceConfig(source).adapter === "canadabuys_contract_history"
  ) {
    return new CanadaBuysContractAdapter(source);
  }
  if (source.source_type === "youtube") return new YouTubeApiAdapter(source);
  if (source.source_type === "reddit") return new RedditApiAdapter(source);
  if (source.source_type === "social" && sourceConfig(source).adapter === "x_api_v2") {
    return new XApiAdapter(source);
  }
  if (["rss", "website", "procurement_portal", "podcast"].includes(source.source_type)) {
    return new WebCollectionAdapter(source);
  }
  throw new Error(`${source.source_type} requires an approved API adapter and cannot be crawled directly.`);
}

function sourceAvailable(source: CollectionSourceRow, anchor: Date) {
  return !source.fetch_cooldown_until || Date.parse(source.fetch_cooldown_until) <= anchor.getTime();
}

export async function collectExternalSources(
  admin: SupabaseClient,
  ownerId: string,
  options: {
    anchor?: Date;
    sourceId?: string;
    pageLimit?: number;
    timeBudgetMs?: number;
  } = {},
): Promise<CollectionRunResult> {
  const anchor = options.anchor ?? new Date();
  const deadline = Date.now() + Math.min(options.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS, 240_000);
  const pageLimit = Math.max(1, Math.min(options.pageLimit ?? DEFAULT_PAGE_LIMIT, 100));
  let query = admin
    .from("intelligence_sources")
    .select(
      "id,owner_id,source_type,name,external_key,status,cohort,measurement_active_from,discovery_origin,triggering_research_lead_id,robots_status,config,checkpoint,last_synced_at,last_successful_fetch_at,fetch_failure_count,fetch_cooldown_until",
    )
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .neq("source_type", "gmail");
  if (options.sourceId) query = query.eq("id", options.sourceId);
  const sourceRows = await query.order("last_successful_fetch_at", { ascending: true, nullsFirst: true });
  if (sourceRows.error) throw new Error(sourceRows.error.message);
  const sources = (sourceRows.data ?? []) as CollectionSourceRow[];
  const startedAt = anchor.toISOString();
  const run = await admin
    .from("intelligence_runs")
    .insert({ owner_id: ownerId, run_type: "crawl", status: "running", started_at: startedAt, heartbeat_at: startedAt })
    .select("id")
    .single();
  if (run.error) throw new Error(run.error.message);
  const runId = String(run.data.id);
  const errors: string[] = [];
  let discovered = 0;
  let processed = 0;
  let failed = 0;
  let excluded = 0;
  let hasMore = false;

  try {
    for (const source of sources) {
      if (Date.now() >= deadline) {
        hasMore = true;
        break;
      }
      if (!sourceAvailable(source, anchor)) {
        excluded += 1;
        continue;
      }
      let sourceFailed = 0;
      let sourceCooldownMs = 0;
      let robotsStatus = source.robots_status;
      try {
        const adapter = createSourceAdapter(source);
        const end = anchor.toISOString();
        const start = new Date(anchor);
        start.setUTCDate(start.getUTCDate() - 14);
        const page = await adapter.discover({
          ownerId,
          windowStart: start.toISOString(),
          windowEnd: end,
          checkpoint: source.checkpoint ?? undefined,
        });
        discovered += page.externalIds.length;
        hasMore ||= Boolean((page.nextCheckpoint as Record<string, unknown> | null)?.has_more);
        for (const externalId of page.externalIds.slice(0, pageLimit)) {
          if (Date.now() >= deadline) {
            hasMore = true;
            break;
          }
          try {
            const document = await adapter.fetch(externalId, ownerId);
            const observedRobotsStatus = document.metadata?.robots_status;
            if (
              observedRobotsStatus === "allowed" ||
              observedRobotsStatus === "disallowed" ||
              observedRobotsStatus === "not_applicable" ||
              observedRobotsStatus === "unknown"
            ) {
              robotsStatus = observedRobotsStatus;
            }
            await processIntelligenceDocument(admin, document, {
              openaiApiKey: process.env.OPENAI_API_KEY,
            });
            processed += 1;
          } catch (error) {
            sourceFailed += 1;
            sourceCooldownMs = Math.max(sourceCooldownMs, collectorCooldownMs(error));
            failed += 1;
            errors.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        const now = new Date().toISOString();
        const update = await admin
          .from("intelligence_sources")
          .update({
            checkpoint: page.nextCheckpoint ?? source.checkpoint ?? {},
            last_synced_at: now,
            last_successful_fetch_at: sourceFailed ? source.last_successful_fetch_at : now,
            last_error: sourceFailed ? errors.at(-1) : null,
            robots_status: robotsStatus,
            fetch_failure_count: sourceFailed ? Number(source.fetch_failure_count ?? 0) + sourceFailed : 0,
            fetch_cooldown_until: sourceFailed
              ? new Date(Date.now() + sourceCooldownMs).toISOString()
              : null,
            updated_at: now,
          })
          .eq("id", source.id)
          .eq("owner_id", ownerId);
        if (update.error) throw new Error(update.error.message);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${source.name}: ${message}`);
        await admin
          .from("intelligence_sources")
          .update({
            last_error: message,
            fetch_failure_count: Number(source.fetch_failure_count ?? 0) + 1,
            fetch_cooldown_until: new Date(Date.now() + collectorCooldownMs(error)).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", source.id)
          .eq("owner_id", ownerId);
      }
    }
  } finally {
    const completedAt = new Date().toISOString();
    const finish = await admin
      .from("intelligence_runs")
      .update({
        status: failed ? (processed ? "partial" : "failed") : "completed",
        discovered_count: discovered,
        processed_count: processed,
        failed_count: failed,
        excluded_count: excluded,
        checkpoint_after: { has_more: hasMore },
        error_summary: errors.slice(0, 5).join("\n") || null,
        heartbeat_at: completedAt,
        completed_at: completedAt,
      })
      .eq("id", runId);
    if (finish.error) throw new Error(finish.error.message);
  }

  return { runId, sources: sources.length, discovered, processed, failed, excluded, hasMore, errors: errors.slice(0, 5) };
}

export const OFFICIAL_SOURCE_SCAFFOLDS = [
  {
    name: "CanadaBuys contract history",
    sourceType: "procurement_portal",
    externalKey: "canadabuys-contract-history",
    config: {
      adapter: "canadabuys_contract_history",
      authority: "official",
      jurisdiction: "Canada",
      dataset_id: "4fe645a1-ffcd-40c1-9385-2c771be956a4",
      dataset_url:
        "https://canadabuys.canada.ca/opendata/pub/2026-2027-contractHistory-contratsOctroyes.csv",
      dataset_page:
        "https://open.canada.ca/data/en/dataset/4fe645a1-ffcd-40c1-9385-2c771be956a4",
    },
  },
  {
    name: "Canadian DND and PSPC releases",
    sourceType: "website",
    externalKey: "canada-dnd-pspc-releases",
    config: {
      authority: "official",
      jurisdiction: "Canada",
      discover_links: true,
      link_path_patterns: ["/news/", "/department-national-defence/", "/public-services-procurement/"],
      urls: [
        "https://www.canada.ca/en/department-national-defence/news.html",
        "https://www.canada.ca/en/public-services-procurement/news.html",
      ],
    },
  },
  {
    name: "United States Department of Defense releases",
    sourceType: "website",
    externalKey: "us-dod-releases",
    config: {
      authority: "official",
      jurisdiction: "United States",
      discover_links: true,
      link_path_patterns: ["/News/Releases/"],
      urls: ["https://www.defense.gov/News/Releases/"],
    },
  },
  {
    name: "NATO, NCIA and NSPA releases",
    sourceType: "website",
    externalKey: "nato-releases",
    config: {
      authority: "official",
      jurisdiction: "NATO",
      discover_links: true,
      link_path_patterns: ["/press", "/news", "/newsroom"],
      urls: [
        "https://www.nato.int/cps/en/natohq/press_releases.htm",
        "https://www.ncia.nato.int/newsroom.html",
        "https://www.nspa.nato.int/news",
      ],
    },
  },
  {
    name: "UK Find a Tender OCDS releases",
    sourceType: "procurement_portal",
    externalKey: "uk-find-a-tender-ocds",
    config: {
      adapter: "uk_find_a_tender_ocds",
      authority: "official",
      jurisdiction: "United Kingdom",
      api_url: FIND_TENDER_API_URL,
      api_documentation: "https://www.find-tender.service.gov.uk/Developer/Documentation",
    },
  },
  {
    name: "EU TED defence and security notices",
    sourceType: "procurement_portal",
    externalKey: "eu-ted-procurement",
    config: {
      adapter: "eu_ted_search_v3",
      authority: "official",
      jurisdiction: "European Union",
      api_url: TED_SEARCH_API_URL,
      expert_query: TED_DEFAULT_EXPERT_QUERY,
      api_documentation: "https://docs.ted.europa.eu/api/latest/search.html",
    },
  },
  {
    name: "Lockheed Martin news releases",
    sourceType: "website",
    externalKey: "lockheed-martin-news-releases",
    config: {
      authority: "official",
      publisher_type: "defence_company",
      prospective_measurement: true,
      requires_manual_approval: true,
      discover_links: true,
      link_path_patterns: ["/news-releases/"],
      urls: ["https://news.lockheedmartin.com/news-releases"],
    },
  },
  {
    name: "BAE Systems newsroom",
    sourceType: "website",
    externalKey: "bae-systems-newsroom",
    config: {
      authority: "official",
      publisher_type: "defence_company",
      prospective_measurement: true,
      requires_manual_approval: true,
      discover_links: true,
      link_path_patterns: ["/newsroom/", "/article/"],
      urls: ["https://www.baesystems.com/en-uk/newsroom"],
    },
  },
  {
    name: "Saab press releases",
    sourceType: "website",
    externalKey: "saab-press-releases",
    config: {
      authority: "official",
      publisher_type: "defence_company",
      prospective_measurement: true,
      requires_manual_approval: true,
      discover_links: true,
      link_path_patterns: ["/newsroom/press-releases/"],
      urls: ["https://www.saab.com/newsroom/press-releases"],
    },
  },
  {
    name: "Rheinmetall news",
    sourceType: "website",
    externalKey: "rheinmetall-news",
    config: {
      authority: "official",
      publisher_type: "defence_company",
      prospective_measurement: true,
      requires_manual_approval: true,
      discover_links: true,
      link_path_patterns: ["/media/news/", "/media/news-watch/news/"],
      urls: ["https://www.rheinmetall.com/en/media/news"],
    },
  },
  {
    name: "Northrop Grumman newsroom",
    sourceType: "website",
    externalKey: "northrop-grumman-newsroom",
    config: {
      authority: "official",
      publisher_type: "defence_company",
      prospective_measurement: true,
      requires_manual_approval: true,
      discover_links: true,
      link_path_patterns: ["/news/", "/news-releases/"],
      urls: ["https://news.northropgrumman.com/"],
    },
  },
] as const;

export async function seedOfficialSourceCandidates(admin: SupabaseClient, ownerId: string) {
  const rows = OFFICIAL_SOURCE_SCAFFOLDS.map((source) => ({
    owner_id: ownerId,
    source_type: source.sourceType,
    name: source.name,
    external_key: source.externalKey,
    status: "candidate",
    cohort: "measurement",
    measurement_active_from: null,
    discovery_origin: "official_source_scaffold",
    robots_status: "unknown",
    config: source.config,
  }));
  const result = await admin
    .from("intelligence_sources")
    .upsert(rows, {
      onConflict: "owner_id,source_type,external_key",
      ignoreDuplicates: true,
    })
    .select("id,name,source_type,status");
  if (result.error) throw new Error(result.error.message);
  return { candidates: result.data ?? [], configured: rows.length };
}

export const __testables = {
  parseCsv,
  csvRecords,
  parseFeed,
  parseSitemap,
  publicFetchUrl,
  captionText,
  parseRetryAfter,
  resetCollectorState: () => {
    domainQueues.clear();
    domainNextRequestAt.clear();
  },
};
