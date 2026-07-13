import { persistDocumentGraph } from "@/lib/ingestion/persistence";
import { persistStructuredDocumentV2 } from "@/lib/ingestion/document-persistence";
import type { StructuredIngestionBody } from "@/lib/ingestion/structured-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StructuredIngestSuccess = {
  ok: true;
  documentId: string;
  sourceType: StructuredIngestionBody["document"]["source_type"];
  deduped: boolean;
  url: string;
  title: string | null;
  counts: {
    entities: number;
    embeddings: number;
  };
};

export type StructuredIngestError = {
  ok: false;
  code: "validation" | "configuration" | "database" | "internal";
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
};

function normalizeEntities(body: StructuredIngestionBody): string[] {
  return (body.entities ?? []).map((entity) =>
    typeof entity === "string" ? entity : entity.entity,
  );
}

function sourceChannel(body: StructuredIngestionBody): string {
  return body.openclaw?.channel?.trim() || (body.telegram ? "telegram" : "api");
}

export async function runStructuredIngestion(
  body: StructuredIngestionBody,
  admin: SupabaseClient,
): Promise<StructuredIngestSuccess | StructuredIngestError> {
  try {
    if (!body.document.url || !body.document.content) {
      const persisted = await persistStructuredDocumentV2(admin, body);
      return {
        ok: true,
        documentId: persisted.documentId,
        sourceType: body.document.source_type,
        deduped: false,
        url: body.document.original_url ?? "",
        title: body.document.title ?? null,
        counts: { entities: 0, embeddings: 0 },
      };
    }
    const persisted = await persistDocumentGraph(admin, {
      url: body.document.url,
      sourceType: body.document.source_type,
      title: body.document.title ?? null,
      summary: body.document.summary ?? null,
      content: body.document.content,
      keywords: body.document.keywords ?? [],
      entities: normalizeEntities(body),
      embedding: body.embedding ?? null,
      sourceChannel: sourceChannel(body),
    });

    return {
      ok: true,
      documentId: persisted.documentId,
      sourceType: body.document.source_type,
      deduped: persisted.deduped,
      url: body.document.url,
      title: body.document.title ?? null,
      counts: persisted.counts,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Structured ingestion failed.";
    console.error("[runStructuredIngestion]", message);
    return {
      ok: false,
      code: "database",
      message,
      httpStatus: 500,
      details: { name: e instanceof Error ? e.name : "Error" },
    };
  }
}
