import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripControlCharacters } from "@/lib/ingestion/normalize";
import {
  INTELLIGENCE_EXTRACTION_MODEL,
  INTELLIGENCE_OPENAI_MAX_RETRIES,
} from "@/lib/intelligence/enrichment";
import { getGmailMessage, gmailMessageToEnvelope } from "@/lib/intelligence/gmail";
import { gmailAccessTokenForSource, getGmailSource } from "@/lib/intelligence/jobs";
import { persistDocumentSegments } from "@/lib/intelligence/signal-persistence";
import {
  INTELLIGENCE_MODEL_SEGMENTATION_THRESHOLD,
  INTELLIGENCE_SEGMENT_PARSER_VERSION,
  buildFallbackSegment,
} from "@/lib/intelligence/segments";
import {
  normalizeSourceUrl,
  sourceUrlHost,
} from "@/lib/intelligence/source-url";
import type {
  IntelligenceDocumentEnvelope,
  IntelligenceDocumentSegmentInput,
} from "@/lib/intelligence/types";

export const INTELLIGENCE_SEGMENTATION_MODEL = INTELLIGENCE_EXTRACTION_MODEL;
export const INTELLIGENCE_SEGMENTATION_INPUT_CHARS = 36_000;
export const INTELLIGENCE_SEGMENTATION_MAX_URLS = 40;
export const INTELLIGENCE_SEGMENTATION_MAX_ARTICLES = 25;
export const INTELLIGENCE_SEGMENTATION_MAX_OUTPUT_TOKENS = 6_000;
export const INTELLIGENCE_SEGMENTATION_TIMEOUT_MS = 60_000;

const BOILERPLATE_PATTERN =
  /\b(unsubscribe|manage (?:your )?preferences|view (?:this )?email in (?:your )?browser|privacy policy|copyright ©|all rights reserved|follow us|forward to a friend|subscribe now)\b/iu;
const SPONSOR_PATTERN =
  /\b(sponsored|advertisement|paid placement|partner content|presented by|from our sponsor)\b/iu;

const ModelArticleSchema = z
  .object({
    title: z.string().min(1).max(280),
    contentText: z.string().min(100).max(8_000),
    outboundUrl: z.string().max(2_000),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const NewsletterModelSegmentationSchema = z
  .object({
    articles: z.array(ModelArticleSchema).min(2).max(INTELLIGENCE_SEGMENTATION_MAX_ARTICLES),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type NewsletterModelSegmentation = z.infer<typeof NewsletterModelSegmentationSchema>;

export type NewsletterModelSegmentationInput = {
  title: string;
  contentText: string;
  allowedUrls: string[];
};

export type NewsletterModelSegmenter = (
  input: NewsletterModelSegmentationInput,
) => Promise<NewsletterModelSegmentation>;

export type NewsletterResegmentationContext = {
  accessToken: string;
  model: string;
  modelSegmenter: NewsletterModelSegmenter | null;
};

function compact(value: string) {
  return stripControlCharacters(value).replace(/\s+/gu, " ").trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function boundedContent(value: string) {
  const normalized = compact(value);
  if (normalized.length <= INTELLIGENCE_SEGMENTATION_INPUT_CHARS) return normalized;
  const tailLength = 6_000;
  const headLength = INTELLIGENCE_SEGMENTATION_INPUT_CHARS - tailLength - 32;
  return `${normalized.slice(0, headLength)} [middle omitted] ${normalized.slice(-tailLength)}`;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function extractedUrls(document: IntelligenceDocumentEnvelope) {
  const metadata = document.metadata ?? {};
  return [
    ...strings(metadata.extracted_links),
    document.canonicalUrl ?? "",
  ]
    .map((value) => normalizeSourceUrl(value))
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, INTELLIGENCE_SEGMENTATION_MAX_URLS)
    .map((value) => truncate(value, 500));
}

export function buildNewsletterModelInput(
  document: IntelligenceDocumentEnvelope,
): NewsletterModelSegmentationInput {
  return {
    title: truncate(compact(document.title ?? "Untitled newsletter"), 300),
    contentText: boundedContent(document.contentText),
    allowedUrls: extractedUrls(document),
  };
}

function hashText(value: string) {
  return createHash("sha256").update(compact(value).toLocaleLowerCase("en-CA")).digest("hex");
}

function roughTokenCount(value: string) {
  return compact(value).split(/\s+/u).filter(Boolean).length;
}

function sourceGroundingRatio(candidate: string, source: string) {
  const sourceText = compact(source).toLocaleLowerCase("en-CA");
  const candidateText = compact(candidate).toLocaleLowerCase("en-CA");
  if (!candidateText) return 0;
  if (sourceText.includes(candidateText)) return 1;
  const sourceWords = new Set(sourceText.match(/[a-z0-9][a-z0-9'-]{2,}/gu) ?? []);
  const candidateWords = candidateText.match(/[a-z0-9][a-z0-9'-]{2,}/gu) ?? [];
  if (!candidateWords.length) return 0;
  return candidateWords.filter((word) => sourceWords.has(word)).length / candidateWords.length;
}

function shouldExcludeModelArticle(title: string, content: string) {
  const combined = `${title} ${content}`;
  return BOILERPLATE_PATTERN.test(combined) || SPONSOR_PATTERN.test(combined);
}

export function modelSegmentationToSegments(input: {
  output: NewsletterModelSegmentation;
  sourceText: string;
  allowedUrls: string[];
  model: string;
}): IntelligenceDocumentSegmentInput[] {
  const allowedUrls = new Set(
    input.allowedUrls
      .map((value) => normalizeSourceUrl(value))
      .filter((value): value is string => Boolean(value)),
  );
  const hashes = new Set<string>();
  const accepted: IntelligenceDocumentSegmentInput[] = [];

  for (const article of input.output.articles) {
    const title = truncate(compact(article.title), 280);
    const contentText = truncate(compact(article.contentText), 8_000);
    if (contentText.length < 100 || shouldExcludeModelArticle(title, contentText)) continue;
    if (sourceGroundingRatio(contentText, input.sourceText) < 0.9) continue;
    const contentHash = hashText(contentText);
    if (hashes.has(contentHash)) continue;
    if (accepted.some((segment) =>
      segment.contentText.includes(contentText) || contentText.includes(segment.contentText)
    )) continue;
    hashes.add(contentHash);
    const normalizedUrl = normalizeSourceUrl(article.outboundUrl);
    const outboundUrl = normalizedUrl && allowedUrls.has(normalizedUrl) ? normalizedUrl : null;
    accepted.push({
      segmentIndex: accepted.length,
      segmentType: "editorial",
      title: title || null,
      contentText,
      outboundUrl,
      urlHost: sourceUrlHost(outboundUrl),
      contentHash,
      tokenCount: roughTokenCount(contentText),
      parserVersion: INTELLIGENCE_SEGMENT_PARSER_VERSION,
      confidence: Math.max(0, Math.min(1, Math.min(article.confidence, input.output.confidence))),
      exclusionReason: null,
      metadata: {
        fallback: false,
        coarse_item: false,
        segmentation_method: "model_fallback",
        segmentation_model: input.model,
        model_article_index: accepted.length,
        source_grounding_ratio: sourceGroundingRatio(contentText, input.sourceText),
      },
    });
  }

  return accepted;
}

function fallbackRequest(segment: IntelligenceDocumentSegmentInput) {
  const value = segment.metadata.model_fallback;
  return value && typeof value === "object"
    ? value as { shouldUseModel?: boolean; likelyArticleCount?: number }
    : null;
}

export function requiresModelSegmentation(segments: IntelligenceDocumentSegmentInput[]) {
  return segments.some((segment) =>
    segment.confidence < INTELLIGENCE_MODEL_SEGMENTATION_THRESHOLD &&
    fallbackRequest(segment)?.shouldUseModel === true &&
    Number(fallbackRequest(segment)?.likelyArticleCount ?? 0) >= 2
  );
}

function coarseSegments(document: IntelligenceDocumentEnvelope) {
  return document.segments?.length
    ? document.segments
    : [buildFallbackSegment({
        title: document.title,
        contentText: document.contentText,
        canonicalUrl: document.canonicalUrl,
      })];
}

function markModelFailure(
  segments: IntelligenceDocumentSegmentInput[],
  model: string,
  error: string,
) {
  const attemptedAt = new Date().toISOString();
  return segments.map((segment) => ({
    ...segment,
    metadata: {
      ...segment.metadata,
      model_fallback: {
        ...(fallbackRequest(segment) ?? {}),
        status: "failed",
        model,
        attempted_at: attemptedAt,
        error: truncate(error, 300),
      },
    },
  }));
}

export async function refineNewsletterSegments(
  document: IntelligenceDocumentEnvelope,
  options: {
    model?: string;
    modelSegmenter?: NewsletterModelSegmenter | null;
  } = {},
) {
  const model = options.model ?? INTELLIGENCE_SEGMENTATION_MODEL;
  const deterministic = coarseSegments(document);
  if (!requiresModelSegmentation(deterministic)) {
    return {
      segments: deterministic,
      status: "not_needed" as const,
      attempted: false,
      model,
      error: null,
    };
  }

  try {
    if (!options.modelSegmenter) {
      throw new Error("OPENAI_API_KEY is not configured for model-assisted segmentation.");
    }
    const modelInput = buildNewsletterModelInput(document);
    const output = await options.modelSegmenter(modelInput);
    const parsed = NewsletterModelSegmentationSchema.parse(output);
    const segments = modelSegmentationToSegments({
      output: parsed,
      sourceText: document.contentText,
      allowedUrls: modelInput.allowedUrls,
      model,
    });
    if (segments.length < 2) {
      throw new Error("Model segmentation did not return at least two grounded editorial articles.");
    }
    return {
      segments,
      status: "completed" as const,
      attempted: true,
      model,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model segmentation failed.";
    return {
      segments: markModelFailure(deterministic, model, message),
      status: "failed" as const,
      attempted: true,
      model,
      error: truncate(message, 300),
    };
  }
}

export function createOpenAiNewsletterSegmenter(
  client: OpenAI,
  model = INTELLIGENCE_SEGMENTATION_MODEL,
): NewsletterModelSegmenter {
  return async (input) => {
    const response = await client.responses.parse(
      {
        model,
        max_output_tokens: INTELLIGENCE_SEGMENTATION_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "system",
            content: `Split one newsletter into its independent editorial articles.

Rules:
- Return articles in their original order.
- Copy titles and article text only from the supplied newsletter. Do not summarize, rewrite, or add facts.
- Exclude footers, navigation, unsubscribe/preferences text, social links, advertisements, sponsorships, partner content, and repeated boilerplate.
- Do not combine separate stories. Omit fragments that are not a substantive editorial article.
- Use an outbound URL only when it appears in allowedUrls and clearly belongs to that article; otherwise return an empty string.
- Return at most ${INTELLIGENCE_SEGMENTATION_MAX_ARTICLES} articles.
- Confidence reflects certainty that each item is a distinct editorial article grounded in the supplied text.`,
          },
          {
            role: "user",
            content: JSON.stringify(input),
          },
        ],
        text: {
          format: zodTextFormat(
            NewsletterModelSegmentationSchema,
            "newsletter_article_segments",
          ),
        },
      },
      {
        timeout: INTELLIGENCE_SEGMENTATION_TIMEOUT_MS,
        maxRetries: INTELLIGENCE_OPENAI_MAX_RETRIES,
      },
    );
    if (!response.output_parsed) {
      throw new Error("OpenAI did not return parsed newsletter segments.");
    }
    return response.output_parsed;
  };
}

export async function prepareNewsletterResegmentation(
  admin: SupabaseClient,
  ownerId: string,
): Promise<NewsletterResegmentationContext> {
  const source = await getGmailSource(admin, ownerId);
  if (!source) throw new Error("Connect Gmail before re-segmenting the newsletter archive.");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = INTELLIGENCE_SEGMENTATION_MODEL;
  return {
    accessToken: (await gmailAccessTokenForSource(source)).accessToken,
    model,
    modelSegmenter: apiKey
      ? createOpenAiNewsletterSegmenter(new OpenAI({ apiKey }), model)
      : null,
  };
}

export async function resegmentNewsletterBatch(
  admin: SupabaseClient,
  ownerId: string,
  context: NewsletterResegmentationContext,
  options: { cursor?: number; limit?: number } = {},
) {
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 25)));
  const documents = await admin.from("documents")
    .select("id,external_id,metadata")
    .eq("owner_id", ownerId)
    .eq("source_type", "email_newsletter")
    .order("published_at", { ascending: true })
    .range(cursor, cursor + limit - 1);
  if (documents.error) throw new Error(documents.error.message);

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let segmentCount = 0;
  let modelFallbackAttempts = 0;
  let modelFallbackCompleted = 0;
  let modelFallbackFailed = 0;
  let coarseFallbacks = 0;
  const errors: string[] = [];

  const rows = documents.data ?? [];
  for (let offset = 0; offset < rows.length; offset += 5) {
    await Promise.all(rows.slice(offset, offset + 5).map(async (document) => {
      const metadata = document.metadata && typeof document.metadata === "object"
        ? document.metadata as Record<string, unknown>
        : {};
      if (metadata.segment_parser_version === INTELLIGENCE_SEGMENT_PARSER_VERSION) {
        skipped += 1;
        return;
      }
      try {
        const message = await getGmailMessage(context.accessToken, String(document.external_id));
        const envelope = gmailMessageToEnvelope(message, ownerId);
        const refined = await refineNewsletterSegments(envelope, {
          model: context.model,
          modelSegmenter: context.modelSegmenter,
        });
        envelope.segments = refined.segments;
        const segments = await persistDocumentSegments(admin, envelope, String(document.id));
        if (refined.attempted) modelFallbackAttempts += 1;
        if (refined.status === "completed") modelFallbackCompleted += 1;
        if (refined.status === "failed") modelFallbackFailed += 1;
        if ([...segments.values()].some((segment) => segment.metadata.coarse_item === true)) {
          coarseFallbacks += 1;
        }

        const persistedSegments = [...segments.values()];
        const update = await admin.from("documents").update({
          segment_count: segments.size,
          metadata: {
            ...metadata,
            segment_parser_version: INTELLIGENCE_SEGMENT_PARSER_VERSION,
            segment_count: segments.size,
            segmentation_confidence: persistedSegments.length
              ? persistedSegments.reduce((sum, segment) => sum + segment.confidence, 0) /
                persistedSegments.length
              : 0,
            segmentation_exclusion_count: persistedSegments.filter((segment) =>
              Boolean(segment.exclusionReason)
            ).length,
            segmentation_model_fallback_status: refined.status,
            segmentation_model: refined.attempted ? refined.model : null,
            segmentation_model_error: refined.error,
            segmentation_updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }).eq("owner_id", ownerId).eq("id", document.id);
        if (update.error) throw new Error(update.error.message);
        processed += 1;
        segmentCount += segments.size;
      } catch (error) {
        failed += 1;
        errors.push(`${document.external_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));
  }

  const scanned = documents.data?.length ?? 0;
  return {
    phase: "segmentation" as const,
    parserVersion: INTELLIGENCE_SEGMENT_PARSER_VERSION,
    model: context.model,
    cursor,
    scanned,
    processed,
    skipped,
    failed,
    segmentCount,
    modelFallbackAttempts,
    modelFallbackCompleted,
    modelFallbackFailed,
    coarseFallbacks,
    queuedModelFallbacks: 0,
    errors: errors.slice(0, 10),
    hasMore: scanned === limit,
    nextCursor: scanned === limit ? cursor + scanned : null,
  };
}
