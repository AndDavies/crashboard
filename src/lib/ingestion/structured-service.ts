/**
 * OpenClaw / Leroy structured ingestion — **v2 repository path only**.
 *
 * Each accepted POST creates:
 * - one `documents` row
 * - one `document_captures` row
 * - zero or more `tags` (get-or-create by normalized label + type)
 * - one `document_tags` row per tag intent
 * - one `document_links` row per `related_urls` entry (optional `fanout` in link metadata)
 *
 * Legacy `sources` / `source_contents` / `ingestion_jobs` are not used.
 */
import {
  persistStructuredDocumentV2,
  type PersistStructuredResult,
} from "@/lib/ingestion/document-persistence";
import type { StructuredIngestionBody } from "@/lib/ingestion/structured-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StructuredIngestSuccess = {
  ok: true;
  documentId: string;
  counts: PersistStructuredResult["counts"];
};

export type StructuredIngestError = {
  ok: false;
  code: "validation" | "configuration" | "database" | "internal";
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
};

export async function runStructuredIngestion(
  body: StructuredIngestionBody,
  admin: SupabaseClient,
): Promise<StructuredIngestSuccess | StructuredIngestError> {
  try {
    const result = await persistStructuredDocumentV2(admin, body);
    return {
      ok: true,
      documentId: result.documentId,
      counts: result.counts,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Structured ingestion failed.";
    console.error("[runStructuredIngestion v2]", message);
    return {
      ok: false,
      code: "database",
      message,
      httpStatus: 500,
      details: { name: e instanceof Error ? e.name : "Error" },
    };
  }
}
