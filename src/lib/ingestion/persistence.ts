import type { SupabaseClient } from "@supabase/supabase-js";

export type PersistDocumentInput = {
  url: string;
  sourceType: string;
  title?: string | null;
  summary?: string | null;
  content: string;
  keywords?: string[];
  entities?: string[];
  embedding?: number[] | null;
  sourceChannel?: string | null;
  ingestedAt?: string;
};

export type PersistDocumentResult = {
  documentId: string;
  deduped: boolean;
  counts: {
    entities: number;
    embeddings: number;
  };
};

function uniqueNonEmpty(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values ?? []) {
    const cleaned = value.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }

  return out;
}

export async function persistDocumentGraph(
  admin: SupabaseClient,
  input: PersistDocumentInput,
): Promise<PersistDocumentResult> {
  const url = input.url.trim();
  const now = input.ingestedAt ?? new Date().toISOString();
  const keywords = uniqueNonEmpty(input.keywords);
  const entities = uniqueNonEmpty(input.entities);

  const existing = await admin
    .from("documents")
    .select("id")
    .eq("url", url)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const documentRow = {
    title: input.title?.trim() || null,
    url,
    source_type: input.sourceType,
    summary: input.summary?.trim() || null,
    content: input.content,
    keywords,
    source_channel: input.sourceChannel?.trim() || null,
    ingested_at: now,
  };

  let documentId: string;
  const existingId = existing.data?.id ?? null;

  if (existingId) {
    const updated = await admin
      .from("documents")
      .update(documentRow)
      .eq("id", existingId)
      .select("id")
      .single();

    if (updated.error || !updated.data?.id) {
      throw new Error(updated.error?.message || "Failed to update document.");
    }

    documentId = updated.data.id as string;
  } else {
    const inserted = await admin
      .from("documents")
      .insert(documentRow)
      .select("id")
      .single();

    if (inserted.error || !inserted.data?.id) {
      throw new Error(inserted.error?.message || "Failed to insert document.");
    }

    documentId = inserted.data.id as string;
  }

  const deleteEntities = await admin
    .from("entities")
    .delete()
    .eq("document_id", documentId);
  if (deleteEntities.error) {
    throw new Error(deleteEntities.error.message);
  }

  let entityCount = 0;
  if (entities.length) {
    const insertedEntities = await admin.from("entities").insert(
      entities.map((entity) => ({
        document_id: documentId,
        entity,
      })),
    );

    if (insertedEntities.error) {
      throw new Error(insertedEntities.error.message);
    }

    entityCount = entities.length;
  }

  const deleteEmbeddings = await admin
    .from("embeddings")
    .delete()
    .eq("document_id", documentId);
  if (deleteEmbeddings.error) {
    throw new Error(deleteEmbeddings.error.message);
  }

  let embeddingCount = 0;
  if (input.embedding && input.embedding.length) {
    const insertedEmbedding = await admin.from("embeddings").insert({
      document_id: documentId,
      embedding: input.embedding,
    });

    if (insertedEmbedding.error) {
      throw new Error(insertedEmbedding.error.message);
    }

    embeddingCount = 1;
  }

  return {
    documentId,
    deduped: Boolean(existingId),
    counts: {
      entities: entityCount,
      embeddings: embeddingCount,
    },
  };
}
