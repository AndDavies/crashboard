import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  INTELLIGENCE_ENTITY_TYPES,
  INTELLIGENCE_EVENT_TYPES,
  type IntelligenceDocumentEnvelope,
  type IntelligenceExtraction,
} from "@/lib/intelligence/types";
import {
  classifyCandidateEventTypes,
  hasDefenceRelevance,
} from "@/lib/intelligence/taxonomy";

export const INTELLIGENCE_EXTRACTION_MODEL =
  process.env.OPENAI_INTELLIGENCE_EXTRACTION_MODEL?.trim() || "gpt-5-mini";
export const INTELLIGENCE_EMBEDDING_MODEL =
  process.env.OPENAI_INTELLIGENCE_EMBEDDING_MODEL?.trim() ||
  "text-embedding-3-small";

// OpenAI embedding inputs are limited to 8,192 tokens. Without adding a runtime
// tokenizer, UTF-8 bytes are a safe upper bound on token count because every
// token consumes at least one input byte. The headroom also covers future
// tokenizer differences while preserving long documents through a small batch.
export const INTELLIGENCE_EMBEDDING_CHUNK_BYTES = 8_000;
export const INTELLIGENCE_EMBEDDING_MAX_CHUNKS = 32;
export const INTELLIGENCE_EXTRACTION_TIMEOUT_MS = 75_000;
export const INTELLIGENCE_EMBEDDING_TIMEOUT_MS = 30_000;
// The job checkpoint is the retry boundary. SDK retries would multiply the
// per-message duration and can outlive the serverless worker's stop reserve.
export const INTELLIGENCE_OPENAI_MAX_RETRIES = 0;

const textEncoder = new TextEncoder();

function utf8ByteLength(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

const EntitySchema = z
  .object({
    name: z.string().min(1).max(240),
    entityType: z.enum(INTELLIGENCE_ENTITY_TYPES),
    role: z.string().max(120),
    countryCode: z.string().max(3),
    aliases: z.array(z.string().min(1).max(240)).max(8),
    confidence: z.number().min(0).max(1),
    evidenceText: z.string().max(500),
  })
  .strict();

const EventSchema = z
  .object({
    eventType: z.enum(INTELLIGENCE_EVENT_TYPES),
    lifecycleStatus: z.enum([
      "rumored",
      "announced",
      "open",
      "awarded",
      "in_development",
      "in_trial",
      "deployed",
      "completed",
      "cancelled",
      "unknown",
    ]),
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(1400),
    occurredAt: z.string().max(40),
    announcedAt: z.string().max(40),
    closesAt: z.string().max(40),
    amount: z.number().min(0),
    currency: z.string().max(8),
    geography: z.string().max(160),
    countryCode: z.string().max(3),
    defenceRelevance: z.boolean(),
    canadaAlliedRelevance: z.boolean(),
    confidence: z.number().min(0).max(1),
    evidenceQuality: z.number().min(0).max(1),
    evidenceText: z.string().min(1).max(700),
    entities: z.array(EntitySchema).max(30),
    themes: z.array(z.string().min(1).max(100)).max(12),
  })
  .strict();

export const IntelligenceExtractionSchema = z
  .object({
    documentSummary: z.string().min(1).max(900),
    primaryDomain: z.string().min(1).max(100),
    themes: z.array(z.string().min(1).max(100)).max(20),
    noveltySignals: z.array(z.string().min(1).max(240)).max(12),
    events: z.array(EventSchema).max(12),
    entities: z.array(EntitySchema).max(50),
    qualityFlags: z.array(z.string().min(1).max(180)).max(12),
  })
  .strict();

function compactText(value: string, maxChars = 45_000) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars - 120)} … [truncated for extraction]`;
}

export function prepareEmbeddingInputs(content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error("Cannot create an embedding for empty content.");

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of normalized) {
    const characterBytes = utf8ByteLength(character);
    if (chunk && chunkBytes + characterBytes > INTELLIGENCE_EMBEDDING_CHUNK_BYTES) {
      chunks.push(chunk);
      if (chunks.length >= INTELLIGENCE_EMBEDDING_MAX_CHUNKS) break;
      chunk = character;
      chunkBytes = characterBytes;
      continue;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }

  if (chunk && chunks.length < INTELLIGENCE_EMBEDDING_MAX_CHUNKS) {
    chunks.push(chunk);
  }
  return chunks;
}

function combineEmbeddings(
  inputs: string[],
  data: Array<{ index: number; embedding: number[] }>,
) {
  const embeddings = new Map(data.map((item) => [item.index, item.embedding]));
  const first = embeddings.get(0);
  if (!first?.length || embeddings.size !== inputs.length) {
    throw new Error("OpenAI returned an incomplete embedding batch.");
  }

  const combined = Array.from({ length: first.length }, () => 0);
  let totalWeight = 0;
  for (let index = 0; index < inputs.length; index += 1) {
    const embedding = embeddings.get(index);
    if (!embedding || embedding.length !== combined.length) {
      throw new Error("OpenAI returned inconsistent embedding dimensions.");
    }
    const weight = textEncoder.encode(inputs[index]).byteLength;
    totalWeight += weight;
    for (let dimension = 0; dimension < embedding.length; dimension += 1) {
      combined[dimension] += embedding[dimension] * weight;
    }
  }

  const magnitude = Math.sqrt(
    combined.reduce((total, value) => total + value * value, 0),
  );
  if (!totalWeight || !magnitude) throw new Error("OpenAI returned an empty embedding.");
  return combined.map((value) => value / magnitude);
}

function nullableDate(value: string) {
  if (!value.trim()) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function normalizeExtraction(value: IntelligenceExtraction): IntelligenceExtraction {
  return {
    ...value,
    themes: [...new Set(value.themes.map((theme) => theme.trim()).filter(Boolean))],
    noveltySignals: [...new Set(value.noveltySignals.map((item) => item.trim()).filter(Boolean))],
    events: value.events.map((event) => ({
      ...event,
      occurredAt: nullableDate(event.occurredAt),
      announcedAt: nullableDate(event.announcedAt),
      closesAt: nullableDate(event.closesAt),
      currency: event.currency.trim().toUpperCase(),
      countryCode: event.countryCode.trim().toUpperCase(),
      themes: [...new Set(event.themes.map((theme) => theme.trim()).filter(Boolean))],
    })),
  };
}

export function shouldDeeplyEnrich(document: IntelligenceDocumentEnvelope) {
  const text = `${document.title ?? ""}\n${document.contentText}`;
  return (
    classifyCandidateEventTypes(text).length > 0 ||
    hasDefenceRelevance(text) ||
    /\b(canada|canadian|nato|five eyes|norad|funding|investment|procurement)\b/iu.test(
      text,
    )
  );
}

export async function extractIntelligence(
  document: IntelligenceDocumentEnvelope,
  options: { client: OpenAI; model?: string },
) {
  const candidateTypes = classifyCandidateEventTypes(
    `${document.title ?? ""}\n${document.contentText}`,
  );
  const response = await options.client.responses.parse(
    {
      model: options.model ?? INTELLIGENCE_EXTRACTION_MODEL,
      input: [
        {
          role: "system",
          content: `You extract auditable strategic intelligence from source documents.

Rules:
- Report only facts supported by the supplied source. Never fill missing values from memory.
- Separate mentions from material events. Events must describe an announcement, decision, award, procurement, RFI/RFP/challenge, funding, partnership, development, trial, deployment, policy change, capacity expansion, acquisition, or cancellation.
- Use empty strings and zero for unknown optional scalar values.
- Evidence text must be a short paraphrase, not a long quotation.
- Prefer canonical organization, agency, program, system, technology, sector, geography, alliance, and person names.
- Mark defence relevance only for military, national-security, dual-use, allied capability, or defence-industrial implications.
- Mark Canada/allied relevance for Canada, NATO, NORAD, Five Eyes, or material allied implications.
- Confidence reflects extraction certainty; evidence quality reflects source authority and specificity.
- Treat newsletter summaries as leads unless they directly contain the announcement details.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            source: {
              sourceType: document.sourceType,
              title: document.title,
              publisher: document.publisherName,
              author: document.authorName,
              publishedAt: document.publishedAt,
              originalUrl: document.originalUrl,
              candidateEventTypes: candidateTypes,
            },
            content: compactText(document.contentText),
          }),
        },
      ],
      text: {
        format: zodTextFormat(IntelligenceExtractionSchema, "intelligence_extraction"),
      },
    },
    {
      timeout: INTELLIGENCE_EXTRACTION_TIMEOUT_MS,
      maxRetries: INTELLIGENCE_OPENAI_MAX_RETRIES,
    },
  );

  if (!response.output_parsed) {
    throw new Error("OpenAI did not return parsed intelligence extraction output.");
  }
  return normalizeExtraction(response.output_parsed);
}

export async function createEmbedding(
  content: string,
  options: { client: OpenAI; model?: string },
) {
  const inputs = prepareEmbeddingInputs(content);
  const response = await options.client.embeddings.create(
    {
      model: options.model ?? INTELLIGENCE_EMBEDDING_MODEL,
      input: inputs,
      encoding_format: "float",
    },
    {
      timeout: INTELLIGENCE_EMBEDDING_TIMEOUT_MS,
      maxRetries: INTELLIGENCE_OPENAI_MAX_RETRIES,
    },
  );
  return combineEmbeddings(inputs, response.data);
}
