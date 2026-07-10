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
  const response = await options.client.responses.parse({
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
  });

  if (!response.output_parsed) {
    throw new Error("OpenAI did not return parsed intelligence extraction output.");
  }
  return normalizeExtraction(response.output_parsed);
}

export async function createEmbedding(
  content: string,
  options: { client: OpenAI; model?: string },
) {
  const input = compactText(content, 24_000);
  const response = await options.client.embeddings.create({
    model: options.model ?? INTELLIGENCE_EMBEDDING_MODEL,
    input,
    encoding_format: "float",
  });
  const embedding = response.data[0]?.embedding;
  if (!embedding?.length) throw new Error("OpenAI did not return an embedding.");
  return embedding;
}
