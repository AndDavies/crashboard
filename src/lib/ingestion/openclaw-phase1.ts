import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import OpenAI from "openai";
import * as pdfParse from "pdf-parse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistDocumentGraph } from "@/lib/ingestion/persistence";
import type { OpenclawIngestionBody } from "@/lib/openclaw/ingestion/schema";
import {
  cleanTitle,
  normalizeTextForStorage,
  stripControlCharacters,
} from "@/lib/ingestion/normalize";

export type Phase1IngestionError = {
  ok: false;
  code: "validation" | "extraction" | "database" | "configuration" | "internal";
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
};

export type Phase1SourceType = "article" | "pdf" | "youtube_video" | "x_post";

export type Phase1IngestionSuccess = {
  ok: true;
  documentId: string;
  sourceType: Phase1SourceType;
  deduped: boolean;
  url: string;
  title: string | null;
  counts: {
    entities: number;
    embeddings: number;
  };
  warnings: string[];
};

type ExtractedDocument = {
  sourceType: Phase1SourceType;
  url: string;
  title: string | null;
  content: string;
  summary: string;
  keywords: string[];
  entities: string[];
};

const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "an",
  "and",
  "any",
  "are",
  "as",
  "at",
  "be",
  "been",
  "but",
  "by",
  "can",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "more",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "than",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "who",
  "will",
  "with",
  "you",
  "your",
]);

type PdfParseResult = {
  text?: string;
  info?: { Title?: string };
  metadata?: { get?: (key: string) => unknown };
};

type PdfParseFunction = (data: Buffer) => Promise<PdfParseResult>;
const pdfModule = pdfParse as unknown as { default?: PdfParseFunction };
const pdf: PdfParseFunction = pdfModule.default ??
  (pdfParse as unknown as PdfParseFunction);

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function sentenceSummary(text: string): string {
  const compact = normalizeTextForStorage(text);
  if (!compact) return "";
  const sentences = compact
    .split(/(?<=[.!?])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return truncate(sentences.slice(0, 2).join(" ") || compact, 1200);
}

function extractMeta(document: Document, name: string): string | null {
  const selector = `meta[name=\"${name}\"], meta[property=\"${name}\"]`;
  const value = document.querySelector(selector)?.getAttribute("content")?.trim();
  return value || null;
}

function deriveKeywords(title: string | null, content: string, metaKeywords: string | null): string[] {
  const seeded = (metaKeywords ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const counts = new Map<string, number>();
  const corpus = `${title ?? ""} ${content}`.toLowerCase();
  for (const token of corpus.match(/[a-z][a-z0-9_-]{3,}/gu) ?? []) {
    if (STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);

  return [...new Set([...seeded, ...ranked])].slice(0, 12);
}

function deriveEntities(title: string | null, summary: string, content: string): string[] {
  const corpus = `${title ?? ""}\n${summary}\n${content.slice(0, 4000)}`;
  const matches = corpus.match(/\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}|[A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/g) ?? [];

  const seen = new Set<string>();
  const entities: string[] = [];
  for (const raw of matches) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (value.length < 2) continue;
    if (/^(The|This|That|These|Those|And|But|For|With)$/u.test(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entities.push(value);
    if (entities.length >= 20) break;
  }
  return entities;
}

function filenameTitleFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").filter(Boolean).pop();
    if (!filename) return null;
    const decoded = decodeURIComponent(filename).replace(/\.pdf$/iu, "");
    const cleaned = decoded.replace(/[-_]+/g, " ").trim();
    return cleanTitle(cleaned || decoded);
  } catch {
    return null;
  }
}

function isPdfLikeResponse(response: Response, fallbackUrl: string): boolean {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/pdf")) return true;

  const contentDisposition = (response.headers.get("content-disposition") ?? "").toLowerCase();
  if (contentDisposition.includes(".pdf")) return true;

  try {
    return new URL(response.url || fallbackUrl).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return fallbackUrl.toLowerCase().includes(".pdf");
  }
}

function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
    return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
  } catch {
    return false;
  }
}

function isXHost(host: string): boolean {
  return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com");
}

function isXPostUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
    if (!isXHost(host)) return false;

    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 3 && parts[1] === "status" && /^\d+$/u.test(parts[2] ?? "");
  } catch {
    return false;
  }
}

function extractXPostId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
    if (!isXHost(host)) return null;

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "status" && /^\d+$/u.test(parts[2] ?? "")) {
      return parts[2] ?? null;
    }

    if (parts.length >= 3 && parts[0] === "i" && parts[1] === "status" && /^\d+$/u.test(parts[2] ?? "")) {
      return parts[2] ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0]?.trim();
      return id || null;
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const watchId = parsed.searchParams.get("v")?.trim();
      if (watchId) return watchId;

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1]?.trim() || null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function canonicalizeUrl(input: string): string {
  const raw = input.trim();
  const parsed = new URL(raw);
  parsed.hash = "";

  const videoId = extractYouTubeVideoId(parsed.toString());
  if (videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  const xPostId = extractXPostId(parsed.toString());
  if (xPostId) {
    return `https://x.com/i/status/${encodeURIComponent(xPostId)}`;
  }

  return parsed.toString();
}

async function fetchSource(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        "user-agent": "Crashboard OpenClaw Ingestion/1.0 (+https://www.crashboard.dev)",
        accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.1",
      },
      redirect: "follow",
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch source: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
}

async function extractArticleFromResponse(response: Response, requestedUrl: string): Promise<ExtractedDocument> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`Unsupported content-type for phase 1 ingestion: ${contentType || "unknown"}.`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url || requestedUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const rawTitle = cleanTitle(article?.title ?? dom.window.document.title ?? null);
  const content = normalizeTextForStorage(
    stripControlCharacters(article?.textContent ?? ""),
  );

  if (!content || content.length < 200) {
    throw new Error("Could not extract enough readable article content.");
  }

  const metaDescription = extractMeta(dom.window.document, "description");
  const metaKeywords = extractMeta(dom.window.document, "keywords");
  const summary = truncate(
    normalizeTextForStorage(metaDescription ?? sentenceSummary(content)),
    1200,
  );
  const keywords = deriveKeywords(rawTitle, content, metaKeywords);
  const entities = deriveEntities(rawTitle, summary, content);

  return {
    sourceType: "article",
    url: response.url || requestedUrl,
    title: rawTitle,
    content,
    summary,
    keywords,
    entities,
  };
}

async function extractPdfFromResponse(response: Response, requestedUrl: string): Promise<ExtractedDocument> {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.byteLength) {
    throw new Error("Fetched PDF was empty.");
  }

  let parsed: Awaited<ReturnType<typeof pdf>>;
  try {
    parsed = await pdf(buffer);
  } catch (error) {
    throw new Error(
      `Failed to parse PDF: ${error instanceof Error ? error.message : "unknown parser error"}`,
    );
  }

  const content = normalizeTextForStorage(stripControlCharacters(parsed.text ?? ""));
  if (!content || content.length < 80) {
    throw new Error("Could not extract enough readable PDF text.");
  }

  const metadataTitle = parsed.metadata?.get?.("dc:title");
  const title = cleanTitle(
    parsed.info?.Title
      ?? (typeof metadataTitle === "string" ? metadataTitle : null)
      ?? filenameTitleFromUrl(response.url || requestedUrl),
  );
  const summary = truncate(sentenceSummary(content), 1200);
  const keywords = deriveKeywords(title, content, null);
  const entities = deriveEntities(title, summary, content);

  return {
    sourceType: "pdf",
    url: response.url || requestedUrl,
    title,
    content,
    summary,
    keywords,
    entities,
  };
}

function extractXAuthor(url: string, document: Document): string | null {
  try {
    const pathnameAuthor = new URL(url).pathname.split("/").filter(Boolean)[0]?.trim();
    if (pathnameAuthor && pathnameAuthor !== "i") return pathnameAuthor.replace(/^@/u, "");
  } catch {
    // fall through to metadata parsing
  }

  const title = cleanTitle(
    extractMeta(document, "og:title") ??
      extractMeta(document, "twitter:title") ??
      document.title ??
      null,
  );
  const match = title?.match(/^(.+?)\s+on\s+(?:X|Twitter):/u);
  return match?.[1]?.trim().replace(/^@/u, "") || null;
}

function normalizeQuotedXText(value: string): string {
  let text = normalizeTextForStorage(stripControlCharacters(value));
  text = text.replace(/\s+\/\s+(?:X|Twitter)$/iu, "");
  text = text.replace(/^.+?\s+on\s+(?:X|Twitter):\s*/iu, "");
  text = text.replace(/^Post by\s+@?[^:]+:\s*/iu, "");
  text = text.replace(/^["'“”‘’]+/u, "");
  text = text.replace(/["'“”‘’]+$/u, "");
  return normalizeTextForStorage(text);
}

function extractXPostText(document: Document): string {
  const candidates = [
    extractMeta(document, "twitter:description"),
    extractMeta(document, "og:description"),
    extractMeta(document, "description"),
    extractMeta(document, "twitter:title"),
    extractMeta(document, "og:title"),
    document.title,
  ]
    .map((value) => (value ? normalizeQuotedXText(value) : ""))
    .filter(Boolean)
    .filter((value) => !/^(?:x|twitter)$/iu.test(value));

  const best = candidates.sort((a, b) => b.length - a.length)[0] ?? "";
  if (!best || best.length < 8) {
    throw new Error("Could not extract enough readable X post content.");
  }

  return best;
}

function synthesizeXPostTitle(author: string | null, content: string): string {
  const prefix = author ? `@${author}: ` : "X post: ";
  return truncate(`${prefix}${content}`, 180);
}

async function extractXPostFromResponse(response: Response, requestedUrl: string): Promise<ExtractedDocument> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error(`Unsupported content-type for X post ingestion: ${contentType || "unknown"}.`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url: response.url || requestedUrl });
  const content = extractXPostText(dom.window.document);
  const author = extractXAuthor(response.url || requestedUrl, dom.window.document);
  const title = synthesizeXPostTitle(author, content);
  const summary = truncate(sentenceSummary(content), 1200);
  const keywords = deriveKeywords(title, content, null);
  const entities = deriveEntities(title, summary, content);

  return {
    sourceType: "x_post",
    url: canonicalizeUrl(response.url || requestedUrl),
    title,
    content,
    summary,
    keywords,
    entities,
  };
}

async function extractYouTubeFromUrl(url: string): Promise<ExtractedDocument> {
  const canonicalUrl = canonicalizeUrl(url);
  const videoId = extractYouTubeVideoId(canonicalUrl);
  if (!videoId) {
    throw new Error("Could not determine YouTube video ID.");
  }

  let transcript;
  try {
    const { fetchTranscript } = await import("youtube-transcript");
    transcript = await fetchTranscript(videoId, { fetch: globalThis.fetch });
  } catch (error) {
    throw new Error(
      `Failed to fetch YouTube transcript: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const content = normalizeTextForStorage(
    stripControlCharacters(transcript.map((part) => part.text).join(" ")),
  );
  if (!content || content.length < 80) {
    throw new Error("Could not extract enough readable YouTube transcript text.");
  }

  let title: string | null = null;
  let metaKeywords: string | null = null;
  let metaDescription: string | null = null;

  try {
    const response = await fetchSource(canonicalUrl);
    if (response.ok) {
      const html = await response.text();
      const dom = new JSDOM(html, { url: canonicalUrl });
      title = cleanTitle(
        extractMeta(dom.window.document, "og:title") ??
          extractMeta(dom.window.document, "twitter:title") ??
          dom.window.document.title ??
          null,
      );
      metaKeywords = extractMeta(dom.window.document, "keywords");
      metaDescription =
        extractMeta(dom.window.document, "description") ??
        extractMeta(dom.window.document, "og:description");
    }
  } catch {
    // Best-effort only; transcript content is the critical path.
  }

  const summary = truncate(
    normalizeTextForStorage(metaDescription ?? sentenceSummary(content)),
    1200,
  );
  const keywords = deriveKeywords(title, content, metaKeywords);
  const entities = deriveEntities(title, summary, content);

  return {
    sourceType: "youtube_video",
    url: canonicalUrl,
    title,
    content,
    summary,
    keywords,
    entities,
  };
}

async function extractSource(url: string): Promise<ExtractedDocument> {
  if (isYouTubeUrl(url)) {
    return extractYouTubeFromUrl(url);
  }

  const response = await fetchSource(url);

  if (!response.ok) {
    throw new Error(`Source returned HTTP ${response.status}.`);
  }

  if (isXPostUrl(url)) {
    return extractXPostFromResponse(response, url);
  }

  if (isPdfLikeResponse(response, url)) {
    return extractPdfFromResponse(response, url);
  }

  return extractArticleFromResponse(response, url);
}

async function maybeCreateEmbedding(content: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  const client = new OpenAI({ apiKey });
  const input = truncate(content, 12000);
  const result = await client.embeddings.create({
    model,
    input,
  });
  return result.data[0]?.embedding ?? null;
}

export async function ingestOpenclawPhase1(
  body: OpenclawIngestionBody,
  admin: SupabaseClient,
): Promise<Phase1IngestionSuccess | Phase1IngestionError> {
  let url: string;
  try {
    url = canonicalizeUrl(body.url);
  } catch {
    return {
      ok: false,
      code: "validation",
      message: "body.url must be a valid absolute URL.",
      httpStatus: 400,
    };
  }

  let extracted: ExtractedDocument;
  try {
    extracted = await extractSource(url);
  } catch (error) {
    return {
      ok: false,
      code: "extraction",
      message: error instanceof Error ? error.message : "Source extraction failed.",
      httpStatus: 422,
    };
  }

  const warnings: string[] = [];
  const sourceChannel = body.openclaw?.channel?.trim() || "telegram";

  let embedding: number[] | null = null;
  try {
    embedding = await maybeCreateEmbedding(`${extracted.title ?? ""}\n\n${extracted.summary}\n\n${extracted.content}`);
    if (!embedding) {
      warnings.push("Embedding skipped because OPENAI_API_KEY is not configured.");
    }
  } catch (error) {
    warnings.push(
      `Embedding generation skipped: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  try {
    const persisted = await persistDocumentGraph(admin, {
      url: extracted.url,
      sourceType: extracted.sourceType,
      title: extracted.title,
      summary: extracted.summary || null,
      content: extracted.content,
      keywords: extracted.keywords,
      entities: extracted.entities,
      embedding,
      sourceChannel,
    });

    return {
      ok: true,
      documentId: persisted.documentId,
      sourceType: extracted.sourceType,
      deduped: persisted.deduped,
      url: extracted.url,
      title: extracted.title,
      counts: persisted.counts,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      code: "database",
      message: error instanceof Error ? error.message : "Persistence failed.",
      httpStatus: 500,
    };
  }
}

export const __testables = {
  extractXPostId,
  extractXPostText,
  extractYouTubeVideoId,
  filenameTitleFromUrl,
  isPdfLikeResponse,
  isXPostUrl,
  isYouTubeUrl,
};
