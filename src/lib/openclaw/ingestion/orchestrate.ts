import { ingestOpenclawPhase1, type Phase1IngestionError } from "@/lib/ingestion/openclaw-phase1";
import type { OpenclawIngestionBody } from "@/lib/openclaw/ingestion/schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OpenclawIngestionSuccess {
  ok: true;
  deduped: boolean;
  documentId: string;
  sourceType: string;
  url: string;
  title: string | null;
  warnings: string[];
}

/**
 * OpenClaw → Crashboard URL ingestion.
 *
 * This used to be backed by message-level provenance tables; the current live DB
 * only persists the canonical document graph (dedupe by URL in `documents`).
 */
export async function orchestrateOpenclawTelegramUrlIngestion(
  body: OpenclawIngestionBody,
  admin: SupabaseClient,
): Promise<OpenclawIngestionSuccess | Phase1IngestionError> {
  const outcome = await ingestOpenclawPhase1(body, admin);
  if (!outcome.ok) return outcome;
  return {
    ok: true,
    deduped: outcome.deduped,
    documentId: outcome.documentId,
    sourceType: outcome.sourceType,
    url: outcome.url,
    title: outcome.title,
    warnings: outcome.warnings,
  };
}
