import * as cheerio from "cheerio";
import {
  MAX_FETCH_BYTES,
  FETCH_TIMEOUT_MS,
  INGESTION_USER_AGENT,
} from "@/lib/ingestion/constants";
import {
  cleanTitle,
  normalizeTextForStorage,
  stripControlCharacters,
} from "@/lib/ingestion/normalize";
import type { FetchedResource, HtmlExtractionResult } from "@/lib/ingestion/types";

export class IngestionFetchError extends Error {
  readonly httpStatus?: number;

  constructor(
    message: string,
    options?: { cause?: unknown; httpStatus?: number },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "IngestionFetchError";
    this.httpStatus = options?.httpStatus;
  }
}

/**
 * Normalize URL string for fetch + dedupe: trim, require http(s), strip fragments.
 */
export function normalizeIngestionUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new IngestionFetchError("URL is empty.");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new IngestionFetchError("URL is not valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new IngestionFetchError("Only http and https URLs are allowed.");
  }
  parsed.hash = "";
  return parsed.toString();
}

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = Number.parseInt(header, 10);
  return Number.isFinite(n) ? n : null;
}

async function readBodyWithLimit(res: Response): Promise<ArrayBuffer> {
  const cl = parseContentLength(res.headers.get("content-length"));
  if (cl !== null && cl > MAX_FETCH_BYTES) {
    throw new IngestionFetchError("Remote resource exceeds configured size limit.", {
      httpStatus: 413,
    });
  }

  if (!res.body) {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_FETCH_BYTES) {
      throw new IngestionFetchError("Remote resource exceeds configured size limit.", {
        httpStatus: 413,
      });
    }
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FETCH_BYTES) {
        await reader.cancel();
        throw new IngestionFetchError("Remote resource exceeds configured size limit.", {
          httpStatus: 413,
        });
      }
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/**
 * Fetch a remote resource with timeout, size cap, and redirect following (fetch default).
 */
export async function fetchRemoteResource(url: string): Promise<FetchedResource> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": INGESTION_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/pdf,text/plain;q=0.9,*/*;q=0.8",
      },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new IngestionFetchError("Fetch timed out.", { cause: e });
    }
    throw new IngestionFetchError("Failed to fetch URL.", { cause: e });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new IngestionFetchError(`HTTP ${res.status} when fetching URL.`, {
      httpStatus: res.status,
    });
  }

  const buffer = await readBodyWithLimit(res);
  const contentType = (res.headers.get("content-type") ?? "")
    .split(";")[0]
    ?.trim()
    .toLowerCase() ?? "";

  const finalUrl = res.url || url;

  const out: FetchedResource = {
    finalUrl,
    originalUrl: url,
    contentType,
    byteLength: buffer.byteLength,
    buffer,
  };

  if (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml") ||
    contentType.includes("text/plain") ||
    contentType.includes("text/xml")
  ) {
    const charset =
      res.headers.get("content-type")?.match(/charset=([^;]+)/i)?.[1]?.trim() ??
      "utf-8";
    try {
      out.textBody = new TextDecoder(charset).decode(buffer);
    } catch {
      out.textBody = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    }
  }

  return out;
}

function absoluteUrl(href: string | undefined, base: string): string | null {
  if (!href?.trim()) return null;
  try {
    return new URL(href.trim(), base).toString();
  } catch {
    return null;
  }
}

/**
 * HTML → primary text using cheerio (strip scripts/styles, keep body text).
 * Also reads common metadata for catalog fields.
 */
export function extractFromHtml(
  html: string,
  responseUrl: string,
): HtmlExtractionResult {
  const $ = cheerio.load(html);

  const canonicalFromLink = absoluteUrl(
    $('link[rel="canonical"]').attr("href"),
    responseUrl,
  );
  const ogUrl = absoluteUrl(
    $('meta[property="og:url"]').attr("content"),
    responseUrl,
  );
  const canonicalUrl = canonicalFromLink ?? ogUrl;

  const title =
    cleanTitle($('meta[property="og:title"]').attr("content")) ??
    cleanTitle($("title").first().text()) ??
    cleanTitle($("h1").first().text());

  const publisherName =
    cleanTitle($('meta[property="og:site_name"]').attr("content")) ??
    (() => {
      try {
        return cleanTitle(new URL(responseUrl).hostname.replace(/^www\./, ""));
      } catch {
        return null;
      }
    })();

  const lang =
    $("html").attr("lang")?.trim() ||
    $('meta[http-equiv="content-language"]').attr("content")?.trim() ||
    null;

  $("script, style, noscript, svg, iframe").remove();
  const rawText = $("body").text() || $.root().text();
  const normalizedText = normalizeTextForStorage(
    stripControlCharacters(rawText),
  );

  return {
    canonicalUrl,
    title,
    publisherName,
    language: lang,
    rawText,
    normalizedText,
  };
}

export function extractFromPlainText(text: string): HtmlExtractionResult {
  const normalizedText = normalizeTextForStorage(stripControlCharacters(text));
  return {
    canonicalUrl: null,
    title: null,
    publisherName: null,
    language: null,
    rawText: text,
    normalizedText,
  };
}

export function looksLikePdfUrl(url: string): boolean {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return p.endsWith(".pdf") || p.includes(".pdf?");
  } catch {
    return false;
  }
}

export function isPdfContentType(contentType: string): boolean {
  return contentType.includes("application/pdf");
}
