import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractFromHtml,
  extractFromPlainText,
  fetchRemoteResource,
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

type FeedEntry = {
  id: string;
  url: string;
  title: string | null;
  publisher: string | null;
  author: string | null;
  publishedAt: string | null;
  summary: string | null;
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

async function apiJson<T>(
  url: URL,
  options: { authorization?: string; basicAuthorization?: string; method?: "GET" | "POST"; body?: URLSearchParams } = {},
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": COLLECTION_USER_AGENT,
        ...(options.authorization ? { Authorization: options.authorization } : {}),
        ...(options.basicAuthorization ? { Authorization: options.basicAuthorization } : {}),
        ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: options.body,
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error("Approved API response exceeds 5 MB.");
    if (!response.ok) throw new Error(`Approved API request failed with HTTP ${response.status}.`);
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
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
  if (!publicFetchUrl(url)) throw new Error("Private-network source URLs are not permitted.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(normalizeIngestionUrl(url), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": COLLECTION_USER_AGENT, Accept: accept },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} when fetching ${url}.`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error("Remote source exceeds 5 MB.");
    return { text: new TextDecoder("utf-8", { fatal: false }).decode(buffer), url: response.url || url };
  } finally {
    clearTimeout(timeout);
  }
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
    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": COLLECTION_USER_AGENT, Accept: "text/plain" },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) {
      return { allowed: false, status: "disallowed" as const, robotsUrl };
    }
    if (!response.ok) return { allowed: true, status: "not_applicable" as const, robotsUrl };
    const rules = parseRobotsRules(await response.text());
    return {
      allowed: isRobotsAllowed(rules, url),
      status: isRobotsAllowed(rules, url) ? ("allowed" as const) : ("disallowed" as const),
      robotsUrl,
    };
  } catch {
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
    };
    const permission = await robotsPermission(entry.url);
    if (!permission.allowed) throw new Error(`robots.txt disallows ${entry.url}`);
    const resource = await fetchRemoteResource(entry.url);
    if (!resource.textBody) throw new Error("Only permitted HTML, XML, and plain-text collection is supported.");
    const extracted = resource.contentType.includes("html")
      ? extractFromHtml(resource.textBody, resource.finalUrl)
      : extractFromPlainText(resource.textBody);
    const contentText = extracted.normalizedText || entry.summary || "";
    if (!contentText) throw new Error("The source did not contain readable editorial text.");
    const canonicalUrl = normalizeSourceUrl(extracted.canonicalUrl) ?? normalizeSourceUrl(resource.finalUrl) ?? entry.url;
    return {
      ownerId,
      sourceType: sourceTypeFor(this.source),
      externalId: entry.id || createHash("sha256").update(canonicalUrl).digest("hex"),
      originalUrl: entry.url,
      canonicalUrl,
      title: extracted.title ?? entry.title,
      authorName: entry.author,
      publisherName: extracted.publisherName ?? entry.publisher ?? this.source.name,
      language: extracted.language ?? sourceConfig(this.source).language ?? "en",
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
        collector: "web-collector-v1",
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
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "text/vtt" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { text: null, status: "not_permitted" as const, language: null };
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) return { text: null, status: "too_large" as const, language: null };
    const text = captionText(raw);
    return {
      text: text || null,
      status: text ? ("downloaded" as const) : ("empty" as const),
      language: selected.snippet?.language ?? null,
    };
  } catch {
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
              ? new Date(Date.now() + RETRY_COOLDOWN_MS).toISOString()
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
            fetch_cooldown_until: new Date(Date.now() + RETRY_COOLDOWN_MS).toISOString(),
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
    name: "UK and EU procurement entry points",
    sourceType: "procurement_portal",
    externalKey: "uk-eu-procurement",
    config: {
      authority: "official",
      jurisdiction: "United Kingdom and EU",
      discover_links: true,
      link_path_patterns: ["/Notice/", "/search/"],
      urls: [
        "https://www.find-tender.service.gov.uk/Search",
        "https://ted.europa.eu/en/search/result",
      ],
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
};
