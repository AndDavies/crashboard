import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createEmbedding,
  extractIntelligence,
  INTELLIGENCE_EXTRACTION_MODEL,
  shouldDeeplyEnrich,
} from "@/lib/intelligence/enrichment";
import { persistIntelligenceDocument } from "@/lib/intelligence/persistence";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

export type ProcessDocumentResult = {
  documentId: string;
  deduped: boolean;
  deepEnrichment: boolean;
  eventCount: number;
  entityCount: number;
};

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
  const client = apiKey ? new OpenAI({ apiKey }) : null;

  const [extraction, embedding] = await Promise.all([
    deepEnrichment && client ? extractIntelligence(document, { client }) : null,
    client && !options.skipEmbedding
      ? createEmbedding(`${document.title ?? ""}\n${document.contentText}`, { client })
      : null,
  ]);

  const persisted = await persistIntelligenceDocument(admin, document, {
    extraction,
    embedding,
    extractionModel: extraction ? INTELLIGENCE_EXTRACTION_MODEL : null,
  });

  return {
    documentId: persisted.documentId,
    deduped: persisted.deduped,
    deepEnrichment,
    eventCount: persisted.eventIds.length,
    entityCount: persisted.entityIds.length,
  };
}
