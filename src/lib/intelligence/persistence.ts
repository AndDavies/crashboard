import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/ingestion/hash";
import { normalizeTextForStorage } from "@/lib/ingestion/normalize";
import { normalizedEntityName } from "@/lib/intelligence/taxonomy";
import type {
  IntelligenceDocumentEnvelope,
  IntelligenceExtraction,
} from "@/lib/intelligence/types";
import { INTELLIGENCE_EMBEDDING_MODEL } from "@/lib/intelligence/enrichment";

type PersistOptions = {
  extraction?: IntelligenceExtraction | null;
  embedding?: number[] | null;
  extractionModel?: string | null;
};

export type PersistIntelligenceResult = {
  documentId: string;
  deduped: boolean;
  eventIds: string[];
  entityIds: string[];
};

function cleanUrl(value: string | null | undefined) {
  return value?.trim() || null;
}

function hostname(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sourceIndependenceKey(document: IntelligenceDocumentEnvelope) {
  return (
    hostname(document.canonicalUrl) ??
    hostname(document.originalUrl) ??
    normalizedEntityName(document.publisherName ?? document.authorName ?? "unknown")
  );
}

function eventFingerprint(event: IntelligenceExtraction["events"][number]) {
  return sha256Hex(
    [
      event.eventType,
      normalizedEntityName(event.title),
      event.countryCode,
      event.announcedAt.slice(0, 10),
    ].join("|"),
  );
}

function vectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => Number(value.toFixed(8))).join(",")}]`;
}

async function upsertEntity(
  admin: SupabaseClient,
  ownerId: string,
  entity: IntelligenceExtraction["entities"][number],
) {
  const normalized = normalizedEntityName(entity.name);
  if (!normalized) return null;

  const { data, error } = await admin
    .from("intelligence_entities")
    .upsert(
      {
        owner_id: ownerId,
        entity_type: entity.entityType,
        canonical_name: entity.name.trim(),
        normalized_name: normalized,
        country_code: entity.countryCode.trim().toUpperCase() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,entity_type,normalized_name" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const entityId = String(data.id);
  const aliases = [entity.name, ...entity.aliases]
    .map((alias) => ({ alias: alias.trim(), normalized: normalizedEntityName(alias) }))
    .filter((alias) => alias.alias && alias.normalized);

  for (const alias of aliases) {
    const aliasResult = await admin.from("intelligence_entity_aliases").upsert(
      {
        owner_id: ownerId,
        entity_id: entityId,
        alias: alias.alias,
        normalized_alias: alias.normalized,
        source: "model",
      },
      { onConflict: "owner_id,normalized_alias", ignoreDuplicates: true },
    );
    if (aliasResult.error) throw new Error(aliasResult.error.message);
  }

  return entityId;
}

export async function persistIntelligenceDocument(
  admin: SupabaseClient,
  document: IntelligenceDocumentEnvelope,
  options: PersistOptions = {},
): Promise<PersistIntelligenceResult> {
  const now = new Date().toISOString();
  const normalizedContent = normalizeTextForStorage(document.contentText);
  if (!normalizedContent) throw new Error("Cannot persist an empty intelligence document.");

  const canonicalUrl = cleanUrl(document.canonicalUrl);
  const originalUrl = document.originalUrl.trim();
  const contentHash = sha256Hex(normalizedContent);
  const canonicalKey = `${document.sourceType}:${document.externalId}`;

  const existing = await admin
    .from("documents")
    .select("id")
    .eq("owner_id", document.ownerId)
    .eq("source_type", document.sourceType)
    .eq("external_id", document.externalId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  const row = {
    owner_id: document.ownerId,
    source_type: document.sourceType,
    original_url: originalUrl,
    canonical_url: canonicalUrl,
    url_host: hostname(canonicalUrl ?? originalUrl),
    external_id: document.externalId,
    title: document.title?.trim() || null,
    author_name: document.authorName?.trim() || null,
    publisher_name: document.publisherName?.trim() || null,
    language: document.language?.trim() || null,
    published_at: document.publishedAt || null,
    content_text: normalizedContent,
    summary_short:
      options.extraction?.documentSummary ?? document.summaryShort?.trim() ?? null,
    review_status: "inbox",
    ingestion_status: "ready",
    extraction_method: options.extraction ? "openai_structured" : "deterministic",
    extraction_version: options.extraction ? "intelligence-v1" : "rules-v1",
    content_hash: contentHash,
    canonical_key: canonicalKey,
    metadata: {
      ...(document.metadata ?? {}),
      labels: document.labels ?? [],
      source_channel: document.sourceChannel ?? null,
      themes: options.extraction?.themes ?? [],
      primary_domain: options.extraction?.primaryDomain ?? null,
      novelty_signals: options.extraction?.noveltySignals ?? [],
    },
    quality_flags: {
      flags: options.extraction?.qualityFlags ?? [],
    },
    captured_at: now,
    updated_at: now,
  };

  let documentId: string;
  if (existing.data?.id) {
    const updated = await admin
      .from("documents")
      .update(row)
      .eq("id", existing.data.id)
      .select("id")
      .single();
    if (updated.error) throw new Error(updated.error.message);
    documentId = String(updated.data.id);
  } else {
    const inserted = await admin.from("documents").insert(row).select("id").single();
    if (inserted.error) throw new Error(inserted.error.message);
    documentId = String(inserted.data.id);
  }

  if (options.embedding?.length) {
    const embeddingResult = await admin
      .from("intelligence_document_embeddings")
      .upsert(
        {
          owner_id: document.ownerId,
          document_id: documentId,
          chunk_index: 0,
          content: normalizedContent.slice(0, 24_000),
          content_hash: contentHash,
          embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
          embedding: vectorLiteral(options.embedding),
        },
        { onConflict: "document_id,chunk_index,content_hash" },
      );
    if (embeddingResult.error) throw new Error(embeddingResult.error.message);
  }

  const extraction = options.extraction;
  if (!extraction) {
    return { documentId, deduped: Boolean(existing.data?.id), eventIds: [], entityIds: [] };
  }

  const allEntities = [...extraction.entities, ...extraction.events.flatMap((event) => event.entities)];
  const entityByKey = new Map<string, string>();
  for (const entity of allEntities) {
    const key = `${entity.entityType}:${normalizedEntityName(entity.name)}`;
    if (!normalizedEntityName(entity.name) || entityByKey.has(key)) continue;
    const entityId = await upsertEntity(admin, document.ownerId, entity);
    if (!entityId) continue;
    entityByKey.set(key, entityId);

    const mention = await admin.from("intelligence_document_entities").upsert(
      {
        owner_id: document.ownerId,
        document_id: documentId,
        entity_id: entityId,
        role: entity.role || "mentioned",
        confidence: entity.confidence,
        evidence_text: entity.evidenceText || null,
      },
      { onConflict: "document_id,entity_id,role" },
    );
    if (mention.error) throw new Error(mention.error.message);
  }

  const eventIds: string[] = [];
  for (const event of extraction.events) {
    const fingerprint = eventFingerprint(event);
    const clusterResult = await admin
      .from("intelligence_clusters")
      .upsert(
        {
          owner_id: document.ownerId,
          cluster_type: "event",
          canonical_document_id: documentId,
          fingerprint,
          title: event.title,
          metadata: { themes: event.themes },
          updated_at: now,
        },
        { onConflict: "owner_id,cluster_type,fingerprint" },
      )
      .select("id")
      .single();
    if (clusterResult.error) throw new Error(clusterResult.error.message);
    const clusterId = String(clusterResult.data.id);

    const clusterDocument = await admin.from("intelligence_cluster_documents").upsert(
      {
        owner_id: document.ownerId,
        cluster_id: clusterId,
        document_id: documentId,
        relationship: "supporting",
      },
      { onConflict: "cluster_id,document_id" },
    );
    if (clusterDocument.error) throw new Error(clusterDocument.error.message);

    const existingEvent = await admin
      .from("intelligence_events")
      .select("id")
      .eq("owner_id", document.ownerId)
      .eq("cluster_id", clusterId)
      .eq("event_type", event.eventType)
      .maybeSingle();
    if (existingEvent.error) throw new Error(existingEvent.error.message);

    const eventRow = {
      owner_id: document.ownerId,
      cluster_id: clusterId,
      event_type: event.eventType,
      lifecycle_status: event.lifecycleStatus,
      title: event.title,
      summary: event.summary,
      occurred_at: event.occurredAt || null,
      announced_at: event.announcedAt || document.publishedAt || null,
      closes_at: event.closesAt || null,
      amount: event.amount || null,
      currency: event.currency || null,
      geography: event.geography || null,
      country_code: event.countryCode || null,
      defence_relevance: event.defenceRelevance,
      canada_allied_relevance: event.canadaAlliedRelevance,
      confidence: event.confidence,
      evidence_quality: event.evidenceQuality,
      extraction_model: options.extractionModel ?? null,
      extraction_version: "intelligence-v1",
      metadata: { themes: event.themes },
      updated_at: now,
    };

    let eventId: string;
    if (existingEvent.data?.id) {
      const updated = await admin
        .from("intelligence_events")
        .update(eventRow)
        .eq("id", existingEvent.data.id)
        .select("id")
        .single();
      if (updated.error) throw new Error(updated.error.message);
      eventId = String(updated.data.id);
    } else {
      const inserted = await admin
        .from("intelligence_events")
        .insert(eventRow)
        .select("id")
        .single();
      if (inserted.error) throw new Error(inserted.error.message);
      eventId = String(inserted.data.id);
    }
    eventIds.push(eventId);

    const evidence = await admin.from("intelligence_event_evidence").upsert(
      {
        owner_id: document.ownerId,
        event_id: eventId,
        document_id: documentId,
        evidence_role:
          document.sourceType === "email_newsletter" ? "newsletter_lead" : "primary",
        evidence_text: event.evidenceText,
        source_independence_key: sourceIndependenceKey(document),
      },
      { onConflict: "event_id,document_id" },
    );
    if (evidence.error) throw new Error(evidence.error.message);

    for (const entity of event.entities) {
      const entityId = entityByKey.get(
        `${entity.entityType}:${normalizedEntityName(entity.name)}`,
      );
      if (!entityId) continue;
      const eventEntity = await admin.from("intelligence_event_entities").upsert(
        {
          owner_id: document.ownerId,
          event_id: eventId,
          entity_id: entityId,
          role: entity.role || "involved",
        },
        { onConflict: "event_id,entity_id,role" },
      );
      if (eventEntity.error) throw new Error(eventEntity.error.message);
    }
  }

  return {
    documentId,
    deduped: Boolean(existing.data?.id),
    eventIds,
    entityIds: [...entityByKey.values()],
  };
}
