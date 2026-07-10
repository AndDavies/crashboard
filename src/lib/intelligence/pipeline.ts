import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmbedding,
  extractIntelligence,
  INTELLIGENCE_EXTRACTION_MODEL,
  INTELLIGENCE_EXTRACTION_TIMEOUT_MS,
  INTELLIGENCE_OPENAI_MAX_RETRIES,
  shouldDeeplyEnrich,
} from "@/lib/intelligence/enrichment";
import { persistIntelligenceDocument } from "@/lib/intelligence/persistence";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

export type ProcessDocumentResult = {
  documentId: string;
  deduped: boolean;
  deepEnrichment: boolean;
  embeddingStatus: "created" | "failed" | "skipped";
  eventCount: number;
  entityCount: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function processIntelligenceDocument(
  admin: SupabaseClient,
  document: IntelligenceDocumentEnvelope,
  options: {
    openaiApiKey?: string;
    forceDeepEnrichment?: boolean;
    skipEmbedding?: boolean;
  } = {},
): Promise<ProcessDocumentResult> {
  const apiKey = options.openaiApiKey?.trim();
  const deepEnrichment =
    Boolean(apiKey) &&
    (options.forceDeepEnrichment === true || shouldDeeplyEnrich(document));
  const client = apiKey
    ? new OpenAI({
        apiKey,
        timeout: INTELLIGENCE_EXTRACTION_TIMEOUT_MS,
        maxRetries: INTELLIGENCE_OPENAI_MAX_RETRIES,
      })
    : null;

  const [extraction, embeddingOutcome] = await Promise.all([
    deepEnrichment && client ? extractIntelligence(document, { client }) : null,
    client && !options.skipEmbedding
      ? createEmbedding(`${document.title ?? ""}\n${document.contentText}`, { client })
          .then((embedding) => ({ embedding, error: null }))
          .catch((error: unknown) => {
            console.error("[intelligence] Embedding failed; continuing without it.", {
              sourceType: document.sourceType,
              externalId: document.externalId,
              error: errorMessage(error),
            });
            return { embedding: null, error };
          })
      : Promise.resolve({ embedding: null, error: null }),
  ]);

  const persisted = await persistIntelligenceDocument(admin, document, {
    extraction,
    embedding: embeddingOutcome.embedding,
    extractionModel: extraction ? INTELLIGENCE_EXTRACTION_MODEL : null,
    processingQualityFlags: embeddingOutcome.error ? ["embedding_failed"] : [],
  });

  return {
    documentId: persisted.documentId,
    deduped: persisted.deduped,
    deepEnrichment,
    embeddingStatus: options.skipEmbedding || !client
      ? "skipped"
      : embeddingOutcome.error || persisted.embeddingPersisted === false
        ? "failed"
        : "created",
    eventCount: persisted.eventIds.length,
    entityCount: persisted.entityIds.length,
  };
}
