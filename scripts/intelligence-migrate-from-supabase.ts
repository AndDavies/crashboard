import { config as loadEnvironment } from "dotenv";
import { createHash } from "node:crypto";

loadEnvironment({ path: ".env.local", quiet: true });

import { buildDeterministicSignals } from "../src/lib/intelligence/agent-worker/deterministic";
import {
  loadLocalIntelligenceKeychain,
} from "../src/lib/intelligence/agent-worker/local-keychain";
import { sourceFamilyName } from "../src/lib/intelligence/sources";
import { getTursoIntelligenceStore, type IntelligenceStoredDocument } from "../src/lib/intelligence/store";
import { createAdminClient } from "../src/lib/supabase/admin";
import { canonicalIntelligenceOwnerId } from "../src/lib/intelligence/owner";

loadLocalIntelligenceKeychain();
process.env.INTELLIGENCE_STORE = "turso";
delete process.env.OPENAI_API_KEY;
delete process.env.CODEX_API_KEY;

type LegacySource = {
  owner_id: string;
  name: string;
  external_key: string;
  status: string;
  config: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  last_synced_at: string | null;
};

type LegacyDocument = {
  id: string;
  source_type: string | null;
  source_channel: string | null;
  external_id: string | null;
  author_name: string | null;
  publisher_name: string | null;
  published_at: string | null;
  original_url: string | null;
  canonical_url: string | null;
  title: string | null;
  content_text: string | null;
  content_hash: string | null;
  extraction_version: string | null;
  metadata: Record<string, unknown> | null;
};

type LegacySegment = {
  id: string;
  document_id: string;
  segment_index: number;
  title: string | null;
  content_text: string;
  outbound_url: string | null;
  content_hash: string;
  token_count: number;
  parser_version: string;
  confidence: number;
  metadata: Record<string, unknown> | null;
};

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function words(value: string) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${label} failed after five attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function storedDocument(document: LegacyDocument, segment?: LegacySegment): IntelligenceStoredDocument | null {
  const contentText = segment?.content_text?.trim() || document.content_text?.trim();
  if (!contentText) return null;
  const identity = document.external_id || document.id;
  const publisher = document.publisher_name?.trim() || null;
  return {
    id: segment?.id || document.id,
    externalId: segment ? `${identity}:${segment.segment_index}` : `${identity}:coarse`,
    sourceType: document.source_channel || document.source_type || "email_newsletter",
    sourceFamily: sourceFamilyName(publisher || document.author_name || "Unknown source"),
    title: segment?.title?.trim() || document.title?.trim() || "Untitled newsletter item",
    publisher,
    author: document.author_name,
    publishedAt: document.published_at,
    canonicalUrl: segment?.outbound_url || document.canonical_url || document.original_url,
    contentText,
    contentHash: segment?.content_hash || document.content_hash || sha(contentText),
    editorialTokens: segment?.token_count || words(contentText),
    segmentationConfidence: segment?.confidence ?? 0.3,
    parserVersion: segment?.parser_version || document.extraction_version || "legacy-coarse.v1",
    raw: {
      legacyDocumentId: document.id,
      legacySegmentId: segment?.id ?? null,
      legacyMetadata: segment?.metadata ?? document.metadata ?? {},
    },
  };
}

async function main() {
  const supabase = createAdminClient();
  const store = getTursoIntelligenceStore();
  await store.initialize();

  const sourceResult = await withRetry("Gmail source lookup", async () => {
    const result = await supabase.from("intelligence_sources")
      .select("owner_id,name,external_key,status,config,checkpoint,last_synced_at")
      .eq("source_type", "gmail")
      .order("updated_at", { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(20_000))
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return result.data as LegacySource | null;
  });
  if (!sourceResult) throw new Error("No legacy Gmail Intelligence source was found.");

  const intelligenceOwnerId = canonicalIntelligenceOwnerId(
    typeof sourceResult.config?.account_email === "string"
      ? sourceResult.config.account_email
      : sourceResult.external_key,
  );
  await store.upsertSource({
    ownerId: intelligenceOwnerId,
    sourceType: "gmail",
    externalKey: sourceResult.external_key,
    name: sourceResult.name,
    status: "reconnect_required",
    config: { ...(sourceResult.config ?? {}), migratedFrom: "supabase" },
    credential: null,
    checkpoint: {
      migratedAt: new Date().toISOString(),
      lastLegacySyncAt: sourceResult.last_synced_at,
      legacyCheckpointRetained: Boolean(sourceResult.checkpoint),
    },
  });

  const pageSize = 100;
  let offset = 0;
  let sourceDocuments = 0;
  let measurementItems = 0;
  while (true) {
    const documents = await withRetry(`document page ${offset / pageSize + 1}`, async () => {
      const result = await supabase.from("documents")
        .select("id,source_type,source_channel,external_id,author_name,publisher_name,published_at,original_url,canonical_url,title,content_text,content_hash,extraction_version,metadata")
        .eq("owner_id", sourceResult.owner_id)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1)
        .abortSignal(AbortSignal.timeout(20_000));
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []) as LegacyDocument[];
    });
    if (!documents.length) break;

    const ids = documents.map((document) => document.id);
    const segments = await withRetry(`segment page ${offset / pageSize + 1}`, async () => {
      const result = await supabase.from("intelligence_document_segments")
        .select("id,document_id,segment_index,title,content_text,outbound_url,content_hash,token_count,parser_version,confidence,metadata")
        .in("document_id", ids)
        .in("segment_type", ["editorial", "unknown"])
        .order("segment_index", { ascending: true })
        .abortSignal(AbortSignal.timeout(20_000));
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []) as LegacySegment[];
    });
    const grouped = new Map<string, LegacySegment[]>();
    for (const segment of segments) {
      const list = grouped.get(segment.document_id) ?? [];
      list.push(segment);
      grouped.set(segment.document_id, list);
    }
    const items: IntelligenceStoredDocument[] = [];
    for (const document of documents) {
      const eligible = grouped.get(document.id) ?? [];
      if (eligible.length) {
        for (const segment of eligible) {
          const item = storedDocument(document, segment);
          if (item) items.push(item);
        }
      } else {
        const item = storedDocument(document);
        if (item) items.push(item);
      }
    }
    await store.putDocuments(items);
    sourceDocuments += documents.length;
    measurementItems += items.length;
    process.stdout.write(`${JSON.stringify({ phase: "corpus", sourceDocuments, measurementItems })}\n`);
    offset += documents.length;
    if (documents.length < pageSize) break;
  }

  const allDocuments = await store.listDocuments({ limit: 10_000 });
  const refreshId = await store.beginRefresh("backfill");
  const signals = buildDeterministicSignals(allDocuments);
  await store.putSignals(refreshId, signals);
  const validation = await store.validateRefresh(refreshId);
  if (!validation.ok) {
    await store.failRefresh(refreshId, validation.errors.join(" "));
    throw new Error(`Migration validation failed: ${validation.errors.join(" ")}`);
  }
  await store.publishRefresh(refreshId);
  process.stdout.write(`${JSON.stringify({
    phase: "complete",
    ownerId: intelligenceOwnerId,
    sourceDocuments,
    measurementItems,
    signals: signals.length,
    refreshId,
    validation,
    gmailReconnectRequired: true,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
