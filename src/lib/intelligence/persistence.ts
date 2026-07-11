import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/ingestion/hash";
import {
  normalizeTextForStorage,
  stripControlCharacters,
} from "@/lib/ingestion/normalize";
import {
  INTELLIGENCE_EMBEDDING_MODEL,
  INTELLIGENCE_EXTRACTION_VERSION,
} from "@/lib/intelligence/enrichment";
import { normalizedEntityName } from "@/lib/intelligence/taxonomy";
import {
  persistConceptGraph,
  persistDocumentSegments,
  persistSourceIdentity,
} from "@/lib/intelligence/signal-persistence";
import { sourceFamilyName } from "@/lib/intelligence/sources";
import type {
  IntelligenceDocumentEnvelope,
  IntelligenceExtraction,
} from "@/lib/intelligence/types";

type PersistOptions = {
  extraction?: IntelligenceExtraction | null;
  embedding?: number[] | null;
  extractionModel?: string | null;
  inProgressQualityFlags?: string[];
  preserveExistingEnrichment?: boolean;
  processingQualityFlags?: string[];
};

type ExtractionEntity = IntelligenceExtraction["entities"][number];
type ExtractionEvent = IntelligenceExtraction["events"][number];

type EntityDescriptor = {
  entity: ExtractionEntity;
  key: string;
  normalizedName: string;
};

type EventDescriptor = {
  event: ExtractionEvent;
  fingerprint: string;
};

type ExistingEvent = {
  id: string;
  reviewStatus: string;
};

type EntityAssociation = {
  entity_id: string;
  role: string;
};

type EventEntityAssociation = EntityAssociation & {
  event_id: string;
};

export type PersistIntelligenceResult = {
  documentId: string;
  deduped: boolean;
  embeddingPersisted: boolean | null;
  eventIds: string[];
  entityIds: string[];
  segmentIds: string[];
  conceptIds: string[];
};

function cleanUrl(value: string | null | undefined) {
  return value ? stripControlCharacters(value).trim() || null : null;
}

function cleanString(value: string | null | undefined) {
  return value ? stripControlCharacters(value).trim() || null : null;
}

function hostname(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, candidate) =>
      typeof candidate === "string" ? stripControlCharacters(candidate) : candidate,
    ),
  ) as T;
}

function storedFlagValues(value: unknown) {
  const flags = jsonObject(value).flags;
  return Array.isArray(flags)
    ? flags.filter((flag): flag is string => typeof flag === "string")
    : [];
}

function sourceIndependenceKey(document: IntelligenceDocumentEnvelope) {
  if (document.sourceType === "email_newsletter") {
    return normalizedEntityName(
      sourceFamilyName(document.publisherName ?? document.authorName ?? "unknown"),
    );
  }
  return (
    hostname(document.canonicalUrl) ??
    hostname(document.originalUrl) ??
    normalizedEntityName(document.publisherName ?? document.authorName ?? "unknown")
  );
}

function eventFingerprint(event: ExtractionEvent) {
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

function uniqueEntities(extraction: IntelligenceExtraction) {
  const byKey = new Map<string, EntityDescriptor>();
  const allEntities: ExtractionEntity[] = [
    ...extraction.entities,
    ...extraction.events.flatMap((event) => event.entities),
  ];
  for (const entity of allEntities) {
    const normalizedName = normalizedEntityName(entity.name);
    const key = `${entity.entityType}:${normalizedName}`;
    if (!normalizedName || byKey.has(key)) continue;
    byKey.set(key, { entity, key, normalizedName });
  }
  return [...byKey.values()];
}

function uniqueEvents(extraction: IntelligenceExtraction) {
  const byFingerprint = new Map<string, EventDescriptor>();
  for (const event of extraction.events) {
    const fingerprint = eventFingerprint(event);
    // The serial implementation updated a duplicate event with the later value.
    // Map#set preserves that behavior while ensuring one database write per event.
    byFingerprint.set(fingerprint, { event, fingerprint });
  }
  return [...byFingerprint.values()];
}

function canModelUpdateEvent(reviewStatus: string) {
  return reviewStatus === "unreviewed";
}

function isManagedExtractionVersion(value: string) {
  return value === "intelligence-v1" || value === INTELLIGENCE_EXTRACTION_VERSION;
}

function entityAssociationKey(association: EntityAssociation) {
  return `${association.entity_id}:${association.role}`;
}

function eventEntityAssociationKey(association: EventEntityAssociation) {
  return `${association.event_id}:${entityAssociationKey(association)}`;
}

function staleEntityAssociations<T extends EntityAssociation>(
  existing: T[],
  current: T[],
  key: (association: T) => string,
) {
  const currentKeys = new Set(current.map(key));
  return existing.filter((association) => !currentKeys.has(key(association)));
}

function excludeProtectedAssociationKeys<T>(
  current: T[],
  protectedKeys: Set<string>,
  key: (association: T) => string,
) {
  return current.filter((association) => !protectedKeys.has(key(association)));
}

async function removeStaleDocumentEntityAssociations(
  admin: SupabaseClient,
  ownerId: string,
  documentId: string,
  current: EntityAssociation[],
) {
  const existingResult = await admin
    .from("intelligence_document_entities")
    .select("entity_id,role")
    .eq("owner_id", ownerId)
    .eq("document_id", documentId)
    .eq("source", "model");
  if (existingResult.error) throw new Error(existingResult.error.message);

  const existing = (existingResult.data ?? []).map((row) => ({
    entity_id: String(row.entity_id),
    role: String(row.role),
  }));
  const stale = staleEntityAssociations(existing, current, entityAssociationKey);
  if (!stale.length) return;

  const currentEntityIds = new Set(current.map((association) => association.entity_id));
  const removedEntityIds = [
    ...new Set(
      stale
        .filter((association) => !currentEntityIds.has(association.entity_id))
        .map((association) => association.entity_id),
    ),
  ];
  const changedRoles = stale.filter((association) =>
    currentEntityIds.has(association.entity_id),
  );
  const results = await Promise.all([
    ...(removedEntityIds.length
      ? [
          admin
            .from("intelligence_document_entities")
            .delete()
            .eq("owner_id", ownerId)
            .eq("document_id", documentId)
            .eq("source", "model")
            .in("entity_id", removedEntityIds),
        ]
      : []),
    ...changedRoles.map((association) =>
      admin
        .from("intelligence_document_entities")
        .delete()
        .eq("owner_id", ownerId)
        .eq("document_id", documentId)
        .eq("source", "model")
        .eq("entity_id", association.entity_id)
        .eq("role", association.role),
    ),
  ]);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }
}

async function removeStaleEventEntityAssociations(
  admin: SupabaseClient,
  ownerId: string,
  mutableEventIds: string[],
  current: EventEntityAssociation[],
) {
  if (!mutableEventIds.length) return;
  const existingResult = await admin
    .from("intelligence_event_entities")
    .select("event_id,entity_id,role")
    .eq("owner_id", ownerId)
    .eq("source", "model")
    .in("event_id", mutableEventIds);
  if (existingResult.error) throw new Error(existingResult.error.message);

  const existing = (existingResult.data ?? []).map((row) => ({
    event_id: String(row.event_id),
    entity_id: String(row.entity_id),
    role: String(row.role),
  }));
  const stale = staleEntityAssociations(
    existing,
    current,
    eventEntityAssociationKey,
  );
  if (!stale.length) return;

  const results = await Promise.all(
    stale.map((association) =>
      admin
        .from("intelligence_event_entities")
        .delete()
        .eq("owner_id", ownerId)
        .eq("source", "model")
        .eq("event_id", association.event_id)
        .eq("entity_id", association.entity_id)
        .eq("role", association.role),
    ),
  );
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }
}

async function persistEmbedding(
  admin: SupabaseClient,
  ownerId: string,
  documentId: string,
  normalizedContent: string,
  contentHash: string,
  embedding: number[],
) {
  const upsertResult = await admin.from("intelligence_document_embeddings").upsert(
    {
      owner_id: ownerId,
      document_id: documentId,
      chunk_index: 0,
      content: normalizedContent.slice(0, 24_000),
      content_hash: contentHash,
      embedding_model: INTELLIGENCE_EMBEDDING_MODEL,
      embedding: vectorLiteral(embedding),
    },
    { onConflict: "document_id,chunk_index,content_hash" },
  );
  if (upsertResult.error) throw new Error(upsertResult.error.message);

  const cleanupResult = await admin
    .from("intelligence_document_embeddings")
    .delete()
    .eq("owner_id", ownerId)
    .eq("document_id", documentId)
    .neq("content_hash", contentHash);
  if (cleanupResult.error) throw new Error(cleanupResult.error.message);
}

async function persistEntities(
  admin: SupabaseClient,
  ownerId: string,
  documentId: string,
  extraction: IntelligenceExtraction,
) {
  const descriptors = uniqueEntities(extraction);
  if (!descriptors.length) {
    await removeStaleDocumentEntityAssociations(admin, ownerId, documentId, []);
    return new Map<string, string>();
  }

  const now = new Date().toISOString();
  const entityResult = await admin
    .from("intelligence_entities")
    .upsert(
      descriptors.map(({ entity, normalizedName }) => ({
        owner_id: ownerId,
        entity_type: entity.entityType,
        canonical_name: entity.name.trim(),
        normalized_name: normalizedName,
        country_code: entity.countryCode.trim().toUpperCase() || null,
        updated_at: now,
      })),
      { onConflict: "owner_id,entity_type,normalized_name" },
    )
    .select("id,entity_type,normalized_name");
  if (entityResult.error) throw new Error(entityResult.error.message);

  const entityByKey = new Map<string, string>();
  for (const row of entityResult.data ?? []) {
    entityByKey.set(
      `${String(row.entity_type)}:${String(row.normalized_name)}`,
      String(row.id),
    );
  }
  if (entityByKey.size !== descriptors.length) {
    throw new Error("Supabase returned an incomplete entity upsert result.");
  }

  const aliasesByNormalizedName = new Map<
    string,
    {
      owner_id: string;
      entity_id: string;
      alias: string;
      normalized_alias: string;
      source: string;
    }
  >();
  const documentMentions = descriptors.map(({ entity, key }) => {
    const entityId = entityByKey.get(key);
    if (!entityId) throw new Error(`Missing persisted entity for ${key}.`);
    for (const aliasValue of [entity.name, ...entity.aliases]) {
      const alias = aliasValue.trim();
      const normalizedAlias = normalizedEntityName(alias);
      if (!alias || !normalizedAlias || aliasesByNormalizedName.has(normalizedAlias)) {
        continue;
      }
      aliasesByNormalizedName.set(normalizedAlias, {
        owner_id: ownerId,
        entity_id: entityId,
        alias,
        normalized_alias: normalizedAlias,
        source: "model",
      });
    }
    return {
      owner_id: ownerId,
      document_id: documentId,
      entity_id: entityId,
      role: entity.role || "mentioned",
      confidence: entity.confidence,
      evidence_text: entity.evidenceText || null,
      source: "model",
      mention_count: 1,
      extraction_version: INTELLIGENCE_EXTRACTION_VERSION,
      metadata: { aliases: entity.aliases },
    };
  });

  const aliases = [...aliasesByNormalizedName.values()];
  const protectedMentionResult = await admin
    .from("intelligence_document_entities")
    .select("entity_id,role")
    .eq("owner_id", ownerId)
    .eq("document_id", documentId)
    .neq("source", "model");
  if (protectedMentionResult.error) {
    throw new Error(protectedMentionResult.error.message);
  }
  const protectedMentionKeys = new Set(
    (protectedMentionResult.data ?? []).map((row) =>
      entityAssociationKey({
        entity_id: String(row.entity_id),
        role: String(row.role),
      }),
    ),
  );
  const modelDocumentMentions = excludeProtectedAssociationKeys(
    documentMentions,
    protectedMentionKeys,
    (mention) =>
      entityAssociationKey({ entity_id: mention.entity_id, role: mention.role }),
  );
  const [aliasResult, mentionResult] = await Promise.all([
    aliases.length
      ? admin.from("intelligence_entity_aliases").upsert(aliases, {
          onConflict: "owner_id,normalized_alias",
          ignoreDuplicates: true,
        })
      : Promise.resolve({ error: null }),
    modelDocumentMentions.length
      ? admin
          .from("intelligence_document_entities")
          .upsert(modelDocumentMentions, {
            onConflict: "document_id,entity_id,role",
          })
      : Promise.resolve({ error: null }),
  ]);
  if (aliasResult.error) throw new Error(aliasResult.error.message);
  if (mentionResult.error) throw new Error(mentionResult.error.message);
  await removeStaleDocumentEntityAssociations(
    admin,
    ownerId,
    documentId,
    modelDocumentMentions.map((mention) => ({
      entity_id: mention.entity_id,
      role: mention.role,
    })),
  );
  return entityByKey;
}

/**
 * Makes re-enrichment replace this document's previous model event evidence.
 * Evidence belonging to another document is never deleted, and an event row is
 * removed only after confirming that no evidence rows still reference it.
 */
export async function synchronizeDocumentModelEvents(
  admin: SupabaseClient,
  ownerId: string,
  documentId: string,
  currentEventIds: string[],
  currentClusterIds: string[] = [],
) {
  const [evidenceResult, linkedClusterResult, canonicalClusterResult] = await Promise.all([
    admin
      .from("intelligence_event_evidence")
      .select("event_id")
      .eq("owner_id", ownerId)
      .eq("document_id", documentId),
    admin
      .from("intelligence_cluster_documents")
      .select("cluster_id")
      .eq("owner_id", ownerId)
      .eq("document_id", documentId),
    admin
      .from("intelligence_clusters")
      .select("id,canonical_document_id,cluster_type")
      .eq("owner_id", ownerId)
      .eq("cluster_type", "event")
      .eq("canonical_document_id", documentId),
  ]);
  if (evidenceResult.error) throw new Error(evidenceResult.error.message);
  if (linkedClusterResult.error) throw new Error(linkedClusterResult.error.message);
  if (canonicalClusterResult.error) throw new Error(canonicalClusterResult.error.message);

  const linkedClusterIds = [
    ...new Set(
      (linkedClusterResult.data ?? []).map((row) => String(row.cluster_id)),
    ),
  ];
  const linkedEventClusterResult = linkedClusterIds.length
    ? await admin
        .from("intelligence_clusters")
        .select("id,canonical_document_id,cluster_type")
        .eq("owner_id", ownerId)
        .eq("cluster_type", "event")
        .in("id", linkedClusterIds)
    : { data: [], error: null };
  if (linkedEventClusterResult.error) {
    throw new Error(linkedEventClusterResult.error.message);
  }

  const currentIds = new Set(currentEventIds);
  const currentClusters = new Set(currentClusterIds);
  const evidenceEventIds = [
    ...new Set(
      (evidenceResult.data ?? []).map((row) => String(row.event_id)),
    ),
  ];
  const candidateClusterIds = [
    ...new Set([
      ...(linkedEventClusterResult.data ?? []).map((row) => String(row.id)),
      ...(canonicalClusterResult.data ?? []).map((row) => String(row.id)),
    ]),
  ];
  if (!evidenceEventIds.length && !candidateClusterIds.length) return;

  const [eventsByEvidence, eventsByCluster] = await Promise.all([
    evidenceEventIds.length
      ? admin
          .from("intelligence_events")
          .select("id,cluster_id,extraction_version,review_status")
          .eq("owner_id", ownerId)
          .in("id", evidenceEventIds)
      : Promise.resolve({ data: [], error: null }),
    candidateClusterIds.length
      ? admin
          .from("intelligence_events")
          .select("id,cluster_id,extraction_version,review_status")
          .eq("owner_id", ownerId)
          .in("cluster_id", candidateClusterIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsByEvidence.error) throw new Error(eventsByEvidence.error.message);
  if (eventsByCluster.error) throw new Error(eventsByCluster.error.message);

  const candidateEvents = new Map<
    string,
    {
      id: string;
      clusterId: string | null;
      extractionVersion: string;
      reviewStatus: string;
    }
  >();
  for (const row of [...(eventsByEvidence.data ?? []), ...(eventsByCluster.data ?? [])]) {
    candidateEvents.set(String(row.id), {
      id: String(row.id),
      clusterId: row.cluster_id ? String(row.cluster_id) : null,
      extractionVersion: String(row.extraction_version),
      reviewStatus: String(row.review_status),
    });
  }
  const staleEvents = [...candidateEvents.values()].filter(
    (row) =>
      !currentIds.has(row.id) &&
      isManagedExtractionVersion(row.extractionVersion) &&
      row.reviewStatus === "unreviewed",
  );
  const staleEventIds = staleEvents.map((row) => row.id);
  const protectedClusterIds = new Set(
    [...candidateEvents.values()]
      .filter(
        (row) =>
          currentIds.has(row.id) ||
          !isManagedExtractionVersion(row.extractionVersion) ||
          row.reviewStatus !== "unreviewed",
      )
      .map((row) => row.clusterId)
      .filter((clusterId): clusterId is string => Boolean(clusterId)),
  );
  const cleanupClusterIds = [
    ...new Set([
      ...candidateClusterIds,
      ...staleEvents
        .map((row) => row.clusterId)
        .filter((clusterId): clusterId is string => Boolean(clusterId)),
    ]),
  ].filter(
    (clusterId) =>
      !currentClusters.has(clusterId) && !protectedClusterIds.has(clusterId),
  );
  if (!staleEventIds.length && !cleanupClusterIds.length) return;
  const canonicalOwnedClusterIds = new Set(
    (canonicalClusterResult.data ?? []).map((row) => String(row.id)),
  );

  const evidenceDelete = staleEventIds.length
    ? admin
        .from("intelligence_event_evidence")
        .delete()
        .eq("owner_id", ownerId)
        .eq("document_id", documentId)
        .in("event_id", staleEventIds)
    : Promise.resolve({ error: null });
  const clusterDocumentDelete = cleanupClusterIds.length
    ? admin
        .from("intelligence_cluster_documents")
        .delete()
        .eq("owner_id", ownerId)
        .eq("document_id", documentId)
        .in("cluster_id", cleanupClusterIds)
    : Promise.resolve({ error: null });
  const [evidenceDeleteResult, clusterDocumentDeleteResult] = await Promise.all([
    evidenceDelete,
    clusterDocumentDelete,
  ]);
  if (evidenceDeleteResult.error) throw new Error(evidenceDeleteResult.error.message);
  if (clusterDocumentDeleteResult.error) {
    throw new Error(clusterDocumentDeleteResult.error.message);
  }

  const remainingEvidence = staleEventIds.length
    ? await admin
        .from("intelligence_event_evidence")
        .select("event_id")
        .eq("owner_id", ownerId)
        .in("event_id", staleEventIds)
    : { data: [], error: null };
  if (remainingEvidence.error) throw new Error(remainingEvidence.error.message);
  const sharedEventIds = new Set(
    (remainingEvidence.data ?? []).map((row) => String(row.event_id)),
  );
  const orphanEventIds = staleEventIds.filter((eventId) => !sharedEventIds.has(eventId));
  if (orphanEventIds.length) {
    const orphanDelete = await admin
      .from("intelligence_events")
      .delete()
      .eq("owner_id", ownerId)
      .in("id", orphanEventIds);
    if (orphanDelete.error) throw new Error(orphanDelete.error.message);
  }

  if (!cleanupClusterIds.length) return;
  const [remainingEvents, remainingClusterDocuments] = await Promise.all([
    admin
      .from("intelligence_events")
      .select("cluster_id")
      .eq("owner_id", ownerId)
      .in("cluster_id", cleanupClusterIds),
    admin
      .from("intelligence_cluster_documents")
      .select("cluster_id,document_id")
      .eq("owner_id", ownerId)
      .in("cluster_id", cleanupClusterIds),
  ]);
  if (remainingEvents.error) throw new Error(remainingEvents.error.message);
  if (remainingClusterDocuments.error) {
    throw new Error(remainingClusterDocuments.error.message);
  }
  const eventClusterIds = new Set(
    (remainingEvents.data ?? []).map((row) => String(row.cluster_id)),
  );
  const documentsByCluster = new Map<string, string[]>();
  for (const row of remainingClusterDocuments.data ?? []) {
    const clusterId = String(row.cluster_id);
    const documents = documentsByCluster.get(clusterId) ?? [];
    documents.push(String(row.document_id));
    documentsByCluster.set(clusterId, documents);
  }
  const orphanClusterIds = cleanupClusterIds.filter(
    (clusterId) =>
      !eventClusterIds.has(clusterId) && !documentsByCluster.has(clusterId),
  );
  const orphanClusters = new Set(orphanClusterIds);
  const canonicalRepairs = cleanupClusterIds
    .filter(
      (clusterId) =>
        canonicalOwnedClusterIds.has(clusterId) && !orphanClusters.has(clusterId),
    )
    .map((clusterId) => {
      const replacementDocumentId = (documentsByCluster.get(clusterId) ?? []).find(
        (candidateDocumentId) => candidateDocumentId !== documentId,
      );
      return admin
        .from("intelligence_clusters")
        .update({
          canonical_document_id: replacementDocumentId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("owner_id", ownerId)
        .eq("id", clusterId);
    });
  const cleanupResults = await Promise.all([
    ...(orphanClusterIds.length
      ? [
          admin
            .from("intelligence_clusters")
            .delete()
            .eq("owner_id", ownerId)
            .in("id", orphanClusterIds),
        ]
      : []),
    ...canonicalRepairs,
  ]);
  for (const result of cleanupResults) {
    if (result.error) throw new Error(result.error.message);
  }
}

function eventRow(
  ownerId: string,
  clusterId: string,
  document: IntelligenceDocumentEnvelope,
  event: ExtractionEvent,
  extractionModel: string | null | undefined,
  now: string,
) {
  return {
    owner_id: ownerId,
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
    extraction_model: extractionModel ?? null,
    extraction_version: INTELLIGENCE_EXTRACTION_VERSION,
    metadata: { themes: event.themes },
    updated_at: now,
  };
}

async function persistEvents(
  admin: SupabaseClient,
  document: IntelligenceDocumentEnvelope,
  documentId: string,
  extraction: IntelligenceExtraction,
  extractionModel: string | null | undefined,
  entityByKeyPromise: Promise<Map<string, string>>,
) {
  const descriptors = uniqueEvents(extraction);
  if (!descriptors.length) {
    await synchronizeDocumentModelEvents(admin, document.ownerId, documentId, []);
    return [];
  }

  const now = new Date().toISOString();
  const clusterResult = await admin
    .from("intelligence_clusters")
    .upsert(
      descriptors.map(({ event, fingerprint }) => ({
        owner_id: document.ownerId,
        cluster_type: "event",
        canonical_document_id: documentId,
        fingerprint,
        title: event.title,
        metadata: { themes: event.themes },
        updated_at: now,
      })),
      { onConflict: "owner_id,cluster_type,fingerprint" },
    )
    .select("id,fingerprint");
  if (clusterResult.error) throw new Error(clusterResult.error.message);

  const clusterByFingerprint = new Map<string, string>();
  for (const row of clusterResult.data ?? []) {
    clusterByFingerprint.set(String(row.fingerprint), String(row.id));
  }
  if (clusterByFingerprint.size !== descriptors.length) {
    throw new Error("Supabase returned an incomplete cluster upsert result.");
  }

  const clusterIds = [...clusterByFingerprint.values()];
  const [clusterDocumentResult, existingEventResult] = await Promise.all([
    admin.from("intelligence_cluster_documents").upsert(
      clusterIds.map((clusterId) => ({
        owner_id: document.ownerId,
        cluster_id: clusterId,
        document_id: documentId,
        relationship: "supporting",
      })),
      { onConflict: "cluster_id,document_id" },
    ),
    admin
      .from("intelligence_events")
      .select("id,cluster_id,event_type,review_status")
      .eq("owner_id", document.ownerId)
      .in("cluster_id", clusterIds),
  ]);
  if (clusterDocumentResult.error) throw new Error(clusterDocumentResult.error.message);
  if (existingEventResult.error) throw new Error(existingEventResult.error.message);

  const existingEventByKey = new Map<string, ExistingEvent>();
  for (const row of existingEventResult.data ?? []) {
    const key = `${String(row.cluster_id)}:${String(row.event_type)}`;
    if (existingEventByKey.has(key)) {
      throw new Error(`Multiple intelligence events exist for ${key}.`);
    }
    existingEventByKey.set(key, {
      id: String(row.id),
      reviewStatus: String(row.review_status),
    });
  }

  const plans = descriptors.map(({ event, fingerprint }) => {
    const clusterId = clusterByFingerprint.get(fingerprint);
    if (!clusterId) throw new Error(`Missing persisted cluster for ${fingerprint}.`);
    const key = `${clusterId}:${event.eventType}`;
    return {
      event,
      key,
      clusterId,
      existing: existingEventByKey.get(key),
      row: eventRow(
        document.ownerId,
        clusterId,
        document,
        event,
        extractionModel,
        now,
      ),
    };
  });

  const existingPlans = plans.filter((plan) => Boolean(plan.existing));
  const modelWritePlans = plans.filter(
    (plan) =>
      !plan.existing || canModelUpdateEvent(plan.existing.reviewStatus),
  );
  const modelWriteResult = modelWritePlans.length
    ? await admin
        .from("intelligence_events")
        .upsert(modelWritePlans.map((plan) => plan.row), {
          onConflict: "cluster_id,event_type",
        })
        .select("id,cluster_id,event_type")
    : { data: [], error: null };
  if (modelWriteResult.error) throw new Error(modelWriteResult.error.message);

  const eventIdByKey = new Map<string, string>();
  for (const plan of existingPlans) {
    eventIdByKey.set(plan.key, plan.existing?.id as string);
  }
  for (const row of modelWriteResult.data ?? []) {
    eventIdByKey.set(
      `${String(row.cluster_id)}:${String(row.event_type)}`,
      String(row.id),
    );
  }
  if (eventIdByKey.size !== plans.length) {
    throw new Error("Supabase returned an incomplete event persistence result.");
  }

  const eventIds = plans.map((plan) => {
    const eventId = eventIdByKey.get(plan.key);
    if (!eventId) throw new Error(`Missing persisted event for ${plan.key}.`);
    return eventId;
  });
  const entityByKey = await entityByKeyPromise;
  const evidenceRows = plans.map((plan) => ({
    owner_id: document.ownerId,
    event_id: eventIdByKey.get(plan.key) as string,
    document_id: documentId,
    evidence_role:
      document.sourceType === "email_newsletter" ? "newsletter_lead" : "primary",
    evidence_text: plan.event.evidenceText,
    source_independence_key: sourceIndependenceKey(document),
  }));
  const reviewedEventIds = plans
    .filter(
      (plan) =>
        plan.existing && !canModelUpdateEvent(plan.existing.reviewStatus),
    )
    .map((plan) => plan.existing?.id as string);
  const reviewedEvidenceResult = reviewedEventIds.length
    ? await admin
        .from("intelligence_event_evidence")
        .select("event_id")
        .eq("owner_id", document.ownerId)
        .eq("document_id", documentId)
        .in("event_id", reviewedEventIds)
    : { data: [], error: null };
  if (reviewedEvidenceResult.error) {
    throw new Error(reviewedEvidenceResult.error.message);
  }
  const protectedEvidenceEventIds = new Set(
    (reviewedEvidenceResult.data ?? []).map((row) => String(row.event_id)),
  );
  const evidenceRowsToWrite = excludeProtectedAssociationKeys(
    evidenceRows,
    protectedEvidenceEventIds,
    (evidence) => evidence.event_id,
  );
  const eventEntityByKey = new Map<
    string,
    {
      owner_id: string;
      event_id: string;
      entity_id: string;
      role: string;
      source: string;
      confidence: number;
      evidence_text: string | null;
      extraction_version: string;
      metadata: Record<string, unknown>;
    }
  >();
  for (const plan of plans) {
    if (
      plan.existing &&
      !canModelUpdateEvent(plan.existing.reviewStatus)
    ) {
      continue;
    }
    const eventId = eventIdByKey.get(plan.key) as string;
    for (const entity of plan.event.entities) {
      const entityId = entityByKey.get(
        `${entity.entityType}:${normalizedEntityName(entity.name)}`,
      );
      if (!entityId) continue;
      const role = entity.role || "involved";
      eventEntityByKey.set(`${eventId}:${entityId}:${role}`, {
        owner_id: document.ownerId,
        event_id: eventId,
        entity_id: entityId,
        role,
        source: "model",
        confidence: entity.confidence,
        evidence_text: entity.evidenceText || null,
        extraction_version: INTELLIGENCE_EXTRACTION_VERSION,
        metadata: { aliases: entity.aliases },
      });
    }
  }
  const eventEntityRows = [...eventEntityByKey.values()];
  const mutableEventIds = modelWritePlans.map(
    (plan) => eventIdByKey.get(plan.key) as string,
  );
  const protectedEventEntityResult = mutableEventIds.length
    ? await admin
        .from("intelligence_event_entities")
        .select("event_id,entity_id,role")
        .eq("owner_id", document.ownerId)
        .neq("source", "model")
        .in("event_id", mutableEventIds)
    : { data: [], error: null };
  if (protectedEventEntityResult.error) {
    throw new Error(protectedEventEntityResult.error.message);
  }
  const protectedEventEntityKeys = new Set(
    (protectedEventEntityResult.data ?? []).map((row) =>
      eventEntityAssociationKey({
        event_id: String(row.event_id),
        entity_id: String(row.entity_id),
        role: String(row.role),
      }),
    ),
  );
  const modelEventEntityRows = excludeProtectedAssociationKeys(
    eventEntityRows,
    protectedEventEntityKeys,
    eventEntityAssociationKey,
  );
  const [evidenceWrite, eventEntityWrite] = await Promise.all([
    evidenceRowsToWrite.length
      ? admin.from("intelligence_event_evidence").upsert(evidenceRowsToWrite, {
          onConflict: "event_id,document_id",
        })
      : Promise.resolve({ error: null }),
    modelEventEntityRows.length
      ? admin.from("intelligence_event_entities").upsert(modelEventEntityRows, {
          onConflict: "event_id,entity_id,role",
        })
      : Promise.resolve({ error: null }),
  ]);
  if (evidenceWrite.error) throw new Error(evidenceWrite.error.message);
  if (eventEntityWrite.error) throw new Error(eventEntityWrite.error.message);
  await removeStaleEventEntityAssociations(
    admin,
    document.ownerId,
    mutableEventIds,
    modelEventEntityRows,
  );

  await synchronizeDocumentModelEvents(
    admin,
    document.ownerId,
    documentId,
    eventIds,
    clusterIds,
  );
  return eventIds;
}

export async function persistIntelligenceDocument(
  admin: SupabaseClient,
  document: IntelligenceDocumentEnvelope,
  options: PersistOptions = {},
): Promise<PersistIntelligenceResult> {
  const now = new Date().toISOString();
  const normalizedContent = normalizeTextForStorage(
    stripControlCharacters(document.contentText),
  );
  if (!normalizedContent) throw new Error("Cannot persist an empty intelligence document.");

  const canonicalUrl = cleanUrl(document.canonicalUrl);
  const originalUrl = cleanUrl(document.originalUrl) ?? "";
  const externalId = cleanString(document.externalId) ?? document.externalId;
  const contentHash = sha256Hex(normalizedContent);
  const canonicalKey = `${document.sourceType}:${externalId}`;
  const [existing, sourceIdentityId] = await Promise.all([
    admin
      .from("documents")
      .select(
        "id,summary_short,extraction_method,extraction_version,metadata,quality_flags,keywords",
      )
      .eq("owner_id", document.ownerId)
      .eq("source_type", document.sourceType)
      .eq("external_id", externalId)
      .maybeSingle(),
    persistSourceIdentity(admin, document),
  ]);
  if (existing.error) throw new Error(existing.error.message);

  const preserveExistingEnrichment = Boolean(
    options.preserveExistingEnrichment && existing.data?.id && !options.extraction,
  );
  const existingMetadata = preserveExistingEnrichment
    ? jsonObject(existing.data?.metadata)
    : {};
  const qualityFlags = [
    ...new Set([
      ...(preserveExistingEnrichment
        ? storedFlagValues(existing.data?.quality_flags)
        : []),
      ...(options.extraction?.qualityFlags ?? []),
      ...(options.processingQualityFlags ?? []),
    ]),
  ];
  const storedQualityFlags = [
    ...new Set([...qualityFlags, ...(options.inProgressQualityFlags ?? [])]),
  ];
  const existingThemes = Array.isArray(existingMetadata.themes)
    ? existingMetadata.themes
    : [];
  const existingNoveltySignals = Array.isArray(existingMetadata.novelty_signals)
    ? existingMetadata.novelty_signals
    : [];
  const existingPrimaryDomain =
    typeof existingMetadata.primary_domain === "string"
      ? existingMetadata.primary_domain
      : null;

  const row = {
    owner_id: document.ownerId,
    source_type: document.sourceType,
    source_channel: cleanString(document.sourceChannel),
    source_identity_id: sourceIdentityId,
    original_url: originalUrl,
    canonical_url: canonicalUrl,
    url_host: hostname(canonicalUrl ?? originalUrl),
    external_id: externalId,
    title: cleanString(document.title),
    author_name: cleanString(document.authorName),
    publisher_name: cleanString(document.publisherName),
    language: cleanString(document.language),
    published_at: document.publishedAt || null,
    content_text: normalizedContent,
    summary_short:
      options.extraction?.documentSummary ??
      (preserveExistingEnrichment ? existing.data?.summary_short : null) ??
      cleanString(document.summaryShort) ??
      null,
    ingestion_status: "ready",
    extraction_method: options.extraction
      ? "openai_structured"
      : preserveExistingEnrichment
        ? existing.data?.extraction_method ?? "deterministic"
        : "deterministic",
    extraction_version: options.extraction
      ? INTELLIGENCE_EXTRACTION_VERSION
      : preserveExistingEnrichment
        ? existing.data?.extraction_version ?? "rules-v1"
        : "rules-v1",
    content_hash: contentHash,
    canonical_key: canonicalKey,
    segment_count: document.segments?.length ?? 1,
    metadata: {
      ...existingMetadata,
      ...jsonSafe(document.metadata ?? {}),
      labels: document.labels ?? existingMetadata.labels ?? [],
      source_channel:
        document.sourceChannel ?? existingMetadata.source_channel ?? null,
      themes: options.extraction?.themes ?? existingThemes,
      primary_domain: options.extraction?.primaryDomain ?? existingPrimaryDomain,
      novelty_signals:
        options.extraction?.noveltySignals ?? existingNoveltySignals,
    },
    quality_flags: { flags: storedQualityFlags },
    updated_at: now,
  };

  let documentId: string;
  if (existing.data?.id) {
    const updated = await admin
      .from("documents")
      .update(row)
      .eq("owner_id", document.ownerId)
      .eq("id", existing.data.id);
    if (updated.error) throw new Error(updated.error.message);
    documentId = String(existing.data.id);
  } else {
    const inserted = await admin
      .from("documents")
      .insert({ ...row, review_status: "inbox", captured_at: now })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    documentId = String(inserted.data.id);
  }

  const segmentsByIndex = await persistDocumentSegments(
    admin,
    document,
    documentId,
  );

  const embeddingPromise: Promise<boolean | null> = options.embedding?.length
    ? persistEmbedding(
        admin,
        document.ownerId,
        documentId,
        normalizedContent,
        contentHash,
        options.embedding,
      )
        .then(() => true)
        .catch(async (error: unknown) => {
          console.error("[intelligence] Embedding persistence failed; continuing.", {
            documentId,
            error: error instanceof Error ? error.message : String(error),
          });
          const failedFlags = [
            ...new Set([...storedQualityFlags, "embedding_persistence_failed"]),
          ];
          const flagResult = await admin
            .from("documents")
            .update({
              quality_flags: { flags: failedFlags },
              updated_at: new Date().toISOString(),
            })
            .eq("owner_id", document.ownerId)
            .eq("id", documentId);
          if (flagResult.error) {
            console.error("[intelligence] Failed to record embedding persistence flag.", {
              documentId,
              error: flagResult.error.message,
            });
          }
          return false;
        })
    : Promise.resolve(null);

  const extraction = options.extraction;
  if (!extraction) {
    const [embeddingPersisted, conceptIds] = await Promise.all([
      embeddingPromise,
      persistConceptGraph(admin, {
        document,
        documentId,
        segmentsByIndex,
        extraction: null,
        existingThemes,
        existingKeywords: existing.data?.keywords,
      }),
    ]);
    return {
      documentId,
      deduped: Boolean(existing.data?.id),
      embeddingPersisted,
      eventIds: [],
      entityIds: [],
      segmentIds: [...segmentsByIndex.values()].map((segment) => segment.id),
      conceptIds,
    };
  }

  const entityByKeyPromise = persistEntities(
    admin,
    document.ownerId,
    documentId,
    extraction,
  );
  const eventIdsPromise = persistEvents(
    admin,
    document,
    documentId,
    extraction,
    options.extractionModel,
    entityByKeyPromise,
  );
  const [embeddingPersisted, entityByKey, eventIds] = await Promise.all([
    embeddingPromise,
    entityByKeyPromise,
    eventIdsPromise,
  ]);
  const conceptIds = await persistConceptGraph(admin, {
    document,
    documentId,
    segmentsByIndex,
    extraction,
    existingThemes,
    existingKeywords: existing.data?.keywords,
  });

  if (options.inProgressQualityFlags?.length) {
    const completedQualityFlags = [
      ...new Set([
        ...qualityFlags,
        ...(embeddingPersisted === false ? ["embedding_persistence_failed"] : []),
      ]),
    ];
    const completionResult = await admin
      .from("documents")
      .update({
        quality_flags: { flags: completedQualityFlags },
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", document.ownerId)
      .eq("id", documentId);
    if (completionResult.error) throw new Error(completionResult.error.message);
  }

  return {
    documentId,
    deduped: Boolean(existing.data?.id),
    embeddingPersisted,
    eventIds,
    entityIds: [...entityByKey.values()],
    segmentIds: [...segmentsByIndex.values()].map((segment) => segment.id),
    conceptIds,
  };
}

export const __testables = {
  canModelUpdateEvent,
  entityAssociationKey,
  eventEntityAssociationKey,
  excludeProtectedAssociationKeys,
  eventFingerprint,
  staleEntityAssociations,
  uniqueEntities,
  uniqueEvents,
};
