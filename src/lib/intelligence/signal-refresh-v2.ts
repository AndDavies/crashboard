import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCanonicalSignalDailyRows,
  INTELLIGENCE_SIGNAL_METRIC_VERSION,
  summarizeCanonicalSignal,
  type CanonicalSignalDailyRow,
  type SignalMeasurementItem,
  type SignalMeasurementObservation,
} from "@/lib/intelligence/signal-metrics-v2";
import type {
  IntelligenceSignalKind,
  IntelligenceSignalLens,
} from "@/lib/intelligence/signals-v2-types";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import {
  INTELLIGENCE_TERM_EXTRACTION_VERSION,
  refreshTermObservationsBatch,
} from "@/lib/intelligence/term-observations";
import { refreshSegmentEmbeddingsBatch } from "@/lib/intelligence/hybrid-search-v2";
import { rebuildStoryAndEventClustersV2 } from "@/lib/intelligence/dedup-v2";
import {
  prepareNewsletterResegmentation,
  resegmentNewsletterBatch,
} from "@/lib/intelligence/resegmentation-v2";
import {
  refreshConceptEmbeddingsBatch,
  runTopicMaintenance,
} from "@/lib/intelligence/topic-maintenance-v2";
import {
  isMeasurementDocument,
  sourceIdFromDocument,
} from "@/lib/intelligence/source-cohort";

const PAGE_SIZE = 1_000;
const DAY_MS = 86_400_000;

type DbRow = Record<string, unknown>;

function addDays(value: string, days: number) {
  return new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await query(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < PAGE_SIZE) return rows;
  }
}

function object(value: unknown): DbRow {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as DbRow : {};
}

function normalizedSearchText(value: unknown) {
  return ` ${String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-CA")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

function segmentSupportsLabel(content: string, label: unknown, evidence: unknown) {
  const haystack = normalizedSearchText(content);
  const labelText = normalizedSearchText(label).trim();
  if (labelText.length >= 3 && haystack.includes(` ${labelText} `)) return true;
  const evidenceText = normalizedSearchText(evidence).trim();
  return evidenceText.length >= 12 && haystack.includes(` ${evidenceText} `);
}

function measurementSupportsEventSubject(input: {
  eventId: string;
  subjectId: string;
  measurementDocumentsByEvent: Map<string, Set<string>>;
  subjectsByDocument: Map<string, Set<string>>;
}) {
  return [...(input.measurementDocumentsByEvent.get(input.eventId) ?? [])]
    .some((documentId) =>
      input.subjectsByDocument.get(documentId)?.has(input.subjectId) === true
    );
}

function isMeasurementStoryCluster(row: DbRow) {
  const metadata = object(row.metadata);
  return row.cluster_type === "story" &&
    metadata.measurement_eligible === true &&
    String(metadata.dedupe_version ?? "").startsWith("story-dedup-v2.");
}

function lensKeys(label: string, domain = ""): IntelligenceSignalLens[] {
  const value = `${label} ${domain}`.toLocaleLowerCase("en-CA");
  const lenses: IntelligenceSignalLens[] = ["all"];
  if (/\b(defen[cs]e|military|weapon|missile|munition|counter-?uas|radar|nato|army|navy|air force)\b/u.test(value)) {
    lenses.push("defence");
  }
  if (/\b(ai|artificial intelligence|machine learning|large language model|llm|foundation model)\b/u.test(value)) {
    lenses.push("ai");
  }
  if (/\b(cyber|ransomware|malware|zero trust|information security|infosec)\b/u.test(value)) {
    lenses.push("cyber");
  }
  if (/\b(canada|canadian|nato|norad|five eyes|allied|allies)\b/u.test(value)) {
    lenses.push("canada-allies");
  }
  return [...new Set(lenses)];
}

function conceptSignalKind(value: unknown): IntelligenceSignalKind {
  if (value === "capability") return "system";
  if (value === "keyword") return "keyword";
  return "topic";
}

function entitySignalKind(value: unknown): IntelligenceSignalKind | null {
  if (value === "organization" || value === "government_agency") return "organization";
  if (value === "program") return "programme";
  if (value === "product_system" || value === "capability_technology") return "system";
  return null;
}

function summaryByKey(rows: CanonicalSignalDailyRow[], dailyTotals: Map<string, { items: number; tokens: number }>, completeThrough: string) {
  const groups = new Map<string, CanonicalSignalDailyRow[]>();
  for (const row of rows) {
    const group = groups.get(row.signalKey) ?? [];
    group.push(row);
    groups.set(row.signalKey, group);
  }
  return new Map([...groups.entries()].flatMap(([key, group]) => {
    const summary = summarizeCanonicalSignal({ rows: group, dailyTotals, completeThrough });
    return summary ? [[key, summary] as const] : [];
  }));
}

export async function refreshSignalsV2(
  admin: SupabaseClient,
  ownerId: string,
  options: { completeThrough?: string; historyDays?: number } = {},
) {
  const completeThrough = options.completeThrough ?? latestCompleteDateKey();
  const historyDays = Math.min(730, Math.max(112, options.historyDays ?? 395));
  const startDate = addDays(completeThrough, -(historyDays - 1));
  const endTimestamp = `${completeThrough}T23:59:59.999Z`;

  const [segments, identities, sources, storyMemberships, documentMemberships, clusters,
    terms, concepts, documentConcepts, entities, documentEntities, events,
    eventEvidence, eventConcepts, eventEntities] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin
      .from("intelligence_document_segments")
      .select("id,document_id,content_text,segment_type,token_count,confidence,metadata,exclusion_reason,documents!inner(id,title,publisher_name,published_at,created_at,source_identity_id,metadata)")
      .eq("owner_id", ownerId)
      .in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null)
      .gte("documents.published_at", `${startDate}T00:00:00.000Z`)
      .lte("documents.published_at", endTimestamp)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_source_identities")
      .select("id,source_id,source_family,normalized_family,authority_tier")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_sources")
      .select("id,status,cohort,measurement_active_from")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_cluster_segments")
      .select("segment_id,cluster_id")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_cluster_documents")
      .select("document_id,cluster_id")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_clusters")
      .select("id,cluster_type,metadata")
      .eq("owner_id", ownerId).eq("cluster_type", "story")
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_term_observations")
      .select("segment_id,document_id,normalized_term,display_term,term_kind,occurrence_count,salience")
      .eq("owner_id", ownerId)
      .eq("extraction_version", INTELLIGENCE_TERM_EXTRACTION_VERSION)
      .gte("observed_on", startDate).lte("observed_on", completeThrough)
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_concepts")
      .select("id,concept_type,canonical_label,domain,status")
      .eq("owner_id", ownerId).in("status", ["active", "candidate"]).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_concepts")
      .select("document_id,segment_id,concept_id,mention_count,confidence,evidence_text")
      .eq("owner_id", ownerId).gte("confidence", 0.6).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_entities")
      .select("id,entity_type,canonical_name,status")
      .eq("owner_id", ownerId).eq("status", "active").range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_entities")
      .select("document_id,entity_id,mention_count,confidence,evidence_text")
      .eq("owner_id", ownerId).gte("confidence", 0.6).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,cluster_id,event_type,announced_at,occurred_at,confidence,review_status")
      .eq("owner_id", ownerId).neq("event_type", "other").neq("review_status", "rejected")
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_evidence")
      .select("event_id,document_id").eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_concepts")
      .select("event_id,concept_id,confidence").eq("owner_id", ownerId).gte("confidence", 0.6)
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_entities")
      .select("event_id,entity_id,confidence").eq("owner_id", ownerId).gte("confidence", 0.6)
      .range(from, to)),
  ]);

  const identityById = new Map(identities.map((row) => [String(row.id), row]));
  const sourceById = new Map(sources.map((row) => [String(row.id), row]));
  const measurementStoryClusterIds = new Set(
    clusters.filter(isMeasurementStoryCluster).map((row) => String(row.id)),
  );
  const storyBySegment = new Map<string, string>();
  for (const row of storyMemberships) {
    const clusterId = String(row.cluster_id);
    if (measurementStoryClusterIds.has(clusterId)) {
      storyBySegment.set(String(row.segment_id), clusterId);
    }
  }
  const storyByDocument = new Map<string, string>();
  for (const row of documentMemberships) {
    const clusterId = String(row.cluster_id);
    if (measurementStoryClusterIds.has(clusterId)) {
      storyByDocument.set(String(row.document_id), clusterId);
    }
  }

  const items: SignalMeasurementItem[] = [];
  const itemBySegment = new Map<string, SignalMeasurementItem>();
  const itemsByDocument = new Map<string, SignalMeasurementItem[]>();
  const contentByItem = new Map<string, string>();
  for (const row of segments) {
    const document = object(row.documents);
    const publishedAt = String(document.published_at ?? document.created_at ?? "");
    const date = publishedAt.slice(0, 10);
    if (!date || date < startDate || date > completeThrough) continue;
    const identity = identityById.get(String(document.source_identity_id ?? "")) ?? {};
    const source = sourceById.get(sourceIdFromDocument(document, identity)) ?? {};
    if (!isMeasurementDocument({ document, identity, source, publishedAt })) continue;
    const segmentId = String(row.id);
    const documentId = String(row.document_id);
    const item: SignalMeasurementItem = {
      id: segmentId,
      documentId,
      date,
      tokenCount: Number(row.token_count ?? 0),
      sourceFamily: String(
        identity.normalized_family
          ?? identity.source_family
          ?? document.publisher_name
          ?? "unknown source",
      ),
      authorityTier: String(identity.authority_tier ?? "unknown"),
      storyId: storyBySegment.get(segmentId) ?? storyByDocument.get(documentId) ?? `document:${documentId}`,
    };
    items.push(item);
    itemBySegment.set(segmentId, item);
    contentByItem.set(segmentId, String(row.content_text ?? ""));
    const documentItems = itemsByDocument.get(documentId) ?? [];
    documentItems.push(item);
    itemsByDocument.set(documentId, documentItems);
  }

  const entityCountByEvent = new Map<string, number>();
  for (const row of eventEntities) {
    const eventId = String(row.event_id);
    entityCountByEvent.set(eventId, (entityCountByEvent.get(eventId) ?? 0) + 1);
  }
  const validEvents = events.filter((row) => {
    const announcedAt = String(row.announced_at ?? "");
    const occurredAt = String(row.occurred_at ?? "");
    const eventDate = announcedAt || occurredAt;
    if (
      !eventDate || announcedAt > endTimestamp || occurredAt > endTimestamp ||
      Number(row.confidence ?? 0) < 0.6
    ) return false;
    if (row.event_type === "procurement_notice" && !entityCountByEvent.get(String(row.id))) {
      return false;
    }
    return true;
  });
  const validEventIds = new Set(validEvents.map((row) => String(row.id)));
  const actionKeyByEventId = new Map(validEvents.map((row) => [
    String(row.id),
    String(row.cluster_id ?? row.id),
  ]));
  const eventIdsByDocument = new Map<string, Set<string>>();
  const measurementDocumentsByEvent = new Map<string, Set<string>>();
  for (const row of eventEvidence) {
    const eventId = String(row.event_id);
    if (!validEventIds.has(eventId)) continue;
    const documentId = String(row.document_id);
    if (!itemsByDocument.has(documentId)) continue;
    const ids = eventIdsByDocument.get(documentId) ?? new Set<string>();
    ids.add(eventId);
    eventIdsByDocument.set(documentId, ids);
    const documents = measurementDocumentsByEvent.get(eventId) ?? new Set<string>();
    documents.add(documentId);
    measurementDocumentsByEvent.set(eventId, documents);
  }
  const conceptIdsByDocument = new Map<string, Set<string>>();
  for (const row of documentConcepts) {
    const documentId = String(row.document_id);
    if (!itemsByDocument.has(documentId)) continue;
    const ids = conceptIdsByDocument.get(documentId) ?? new Set<string>();
    ids.add(String(row.concept_id));
    conceptIdsByDocument.set(documentId, ids);
  }
  const eventIdsByConcept = new Map<string, Set<string>>();
  for (const row of eventConcepts) {
    const eventId = String(row.event_id);
    if (!validEventIds.has(eventId)) continue;
    const id = String(row.concept_id);
    if (!measurementSupportsEventSubject({
      eventId,
      subjectId: id,
      measurementDocumentsByEvent,
      subjectsByDocument: conceptIdsByDocument,
    })) continue;
    const ids = eventIdsByConcept.get(id) ?? new Set<string>();
    ids.add(eventId);
    eventIdsByConcept.set(id, ids);
  }
  const entityIdsByDocument = new Map<string, Set<string>>();
  for (const row of documentEntities) {
    const documentId = String(row.document_id);
    if (!itemsByDocument.has(documentId)) continue;
    const ids = entityIdsByDocument.get(documentId) ?? new Set<string>();
    ids.add(String(row.entity_id));
    entityIdsByDocument.set(documentId, ids);
  }
  const eventIdsByEntity = new Map<string, Set<string>>();
  for (const row of eventEntities) {
    const eventId = String(row.event_id);
    if (!validEventIds.has(eventId)) continue;
    const id = String(row.entity_id);
    if (!measurementSupportsEventSubject({
      eventId,
      subjectId: id,
      measurementDocumentsByEvent,
      subjectsByDocument: entityIdsByDocument,
    })) continue;
    const ids = eventIdsByEntity.get(id) ?? new Set<string>();
    ids.add(eventId);
    eventIdsByEntity.set(id, ids);
  }
  const actions = (documentId: string, linked?: Set<string>) => {
    const documentEvents = eventIdsByDocument.get(documentId) ?? new Set<string>();
    return [...new Set(
      [...documentEvents]
        .filter((id) => !linked || linked.has(id))
        .map((id) => actionKeyByEventId.get(id) ?? id),
    )];
  };

  const observations: SignalMeasurementObservation[] = [];
  for (const row of terms) {
    const item = itemBySegment.get(String(row.segment_id));
    if (!item) continue;
    const signalId = String(row.normalized_term);
    const label = String(row.display_term);
    observations.push({
      itemId: item.id,
      signalKey: `keyword:${signalId}`,
      signalId,
      signalKind: "keyword",
      signalLabel: label,
      mentions: Number(row.occurrence_count ?? 1),
      extractionConfidence: Math.max(0.6, Number(row.salience ?? 0.6)),
      lensKeys: lensKeys(label),
      actionIds: actions(item.documentId),
    });
  }

  const conceptById = new Map(concepts.map((row) => [String(row.id), row]));
  for (const row of documentConcepts) {
    const concept = conceptById.get(String(row.concept_id));
    if (!concept) continue;
    const kind = conceptSignalKind(concept.concept_type);
    const id = String(concept.id);
    const label = String(concept.canonical_label);
    const documentItems = itemsByDocument.get(String(row.document_id)) ?? [];
    const directItem = row.segment_id ? itemBySegment.get(String(row.segment_id)) : null;
    const matchedItems = directItem ? [directItem] : documentItems.filter((item) =>
      segmentSupportsLabel(
        contentByItem.get(item.id) ?? "",
        label,
        row.evidence_text,
      )
    );
    const supportedItems = matchedItems.length
      ? matchedItems
      : documentItems.length === 1
        ? documentItems
        : [];
    for (const item of supportedItems) {
      observations.push({
        itemId: item.id,
        signalKey: `${kind}:${id}`,
        signalId: id,
        signalKind: kind,
        signalLabel: label,
        mentions: Number(row.mention_count ?? 1),
        extractionConfidence: Number(row.confidence ?? 0.6),
        lensKeys: lensKeys(label, String(concept.domain ?? "")),
        actionIds: actions(item.documentId, eventIdsByConcept.get(id)),
      });
    }
  }

  const entityById = new Map(entities.map((row) => [String(row.id), row]));
  for (const row of documentEntities) {
    const entity = entityById.get(String(row.entity_id));
    const kind = entity ? entitySignalKind(entity.entity_type) : null;
    if (!entity || !kind) continue;
    const id = String(entity.id);
    const label = String(entity.canonical_name);
    const documentItems = itemsByDocument.get(String(row.document_id)) ?? [];
    const matchedItems = documentItems.filter((item) => segmentSupportsLabel(
      contentByItem.get(item.id) ?? "",
      label,
      row.evidence_text,
    ));
    const supportedItems = matchedItems.length
      ? matchedItems
      : documentItems.length === 1
        ? documentItems
        : [];
    for (const item of supportedItems) {
      observations.push({
        itemId: item.id,
        signalKey: `${kind}:${id}`,
        signalId: id,
        signalKind: kind,
        signalLabel: label,
        mentions: Number(row.mention_count ?? 1),
        extractionConfidence: Number(row.confidence ?? 0.6),
        lensKeys: lensKeys(label),
        actionIds: actions(item.documentId, eventIdsByEntity.get(id)),
      });
    }
  }

  const dailyRows = buildCanonicalSignalDailyRows({ items, observations });
  const dailyTotals = new Map<string, { items: number; tokens: number }>();
  for (const item of items) {
    const total = dailyTotals.get(item.date) ?? { items: 0, tokens: 0 };
    total.items += 1;
    total.tokens += item.tokenCount;
    dailyTotals.set(item.date, total);
  }
  const summaries = summaryByKey(dailyRows, dailyTotals, completeThrough);
  const storedRows = dailyRows.map((row) => {
    const summary = summaries.get(row.signalKey)!;
    return {
      owner_id: ownerId,
      signal_key: row.signalKey,
      signal_kind: row.signalKind,
      signal_id: row.signalId,
      signal_label: row.signalLabel,
      // The complete-day row is also the persisted query summary. Keep its
      // lenses stable across the full measurement window, not only this day.
      lens_keys: row.signalDate === completeThrough ? summary.lensKeys : row.lensKeys,
      signal_date: row.signalDate,
      metric_version: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      eligible_items: row.eligibleItems,
      supporting_items: row.supportingItems,
      supporting_documents: row.supportingDocuments,
      unique_stories: row.uniqueStories,
      mention_count: row.mentionCount,
      eligible_tokens: row.eligibleTokens,
      independent_source_count: row.independentSourceCount,
      effective_source_count: row.effectiveSourceCount,
      primary_source_count: row.primarySourceCount,
      unique_action_count: row.uniqueActionCount,
      raw_reach: row.rawReach,
      source_balanced_reach: row.sourceBalancedReach,
      mentions_per_10k: row.mentionsPer10k,
      momentum: summary.momentum,
      acceleration: summary.acceleration,
      burst: summary.burst,
      persistence: summary.persistence,
      novelty: summary.novelty,
      confidence: summary.confidence,
      increase_probability: summary.increaseProbability,
      direction: summary.direction,
      evidence_strength: summary.evidenceStrength,
      extraction_confidence: row.extractionConfidence,
      hidden_rank_score: summary.hiddenRankScore,
      metadata: {
        ...row.metadata,
        complete_through: completeThrough,
        has_twelve_complete_weeks: summary.hasTwelveCompleteWeeks,
        active_last_four_weeks: summary.activeLastFourWeeks,
        summary: {
          current_reach: summary.currentReach,
          previous_reach: summary.previousReach,
          current_items: summary.currentItems,
          previous_items: summary.previousItems,
          sources: summary.currentSources,
          stories: summary.currentStories,
          actions: summary.currentActions,
          change_points: summary.changePoints,
        },
      },
      computed_at: new Date().toISOString(),
    };
  });
  const completeDayTotals = dailyTotals.get(completeThrough) ?? { items: 0, tokens: 0 };
  const existingCompleteKeys = new Set(
    storedRows.filter((row) => row.signal_date === completeThrough).map((row) => row.signal_key),
  );
  for (const summary of summaries.values()) {
    if (existingCompleteKeys.has(summary.signalKey)) continue;
    storedRows.push({
      owner_id: ownerId,
      signal_key: summary.signalKey,
      signal_kind: summary.signalKind,
      signal_id: summary.signalId,
      signal_label: summary.signalLabel,
      lens_keys: summary.lensKeys,
      signal_date: completeThrough,
      metric_version: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      eligible_items: completeDayTotals.items,
      supporting_items: 0,
      supporting_documents: 0,
      unique_stories: 0,
      mention_count: 0,
      eligible_tokens: completeDayTotals.tokens,
      independent_source_count: 0,
      effective_source_count: 0,
      primary_source_count: 0,
      unique_action_count: 0,
      raw_reach: 0,
      source_balanced_reach: 0,
      mentions_per_10k: 0,
      momentum: summary.momentum,
      acceleration: summary.acceleration,
      burst: summary.burst,
      persistence: summary.persistence,
      novelty: summary.novelty,
      confidence: summary.confidence,
      increase_probability: summary.increaseProbability,
      direction: summary.direction,
      evidence_strength: summary.evidenceStrength,
      extraction_confidence: summary.extractionConfidence,
      hidden_rank_score: summary.hiddenRankScore,
      metadata: {
        sourceFamilies: [],
        storyIds: [],
        actionIds: [],
        documentIds: [],
        sourceCounts: {},
        complete_through: completeThrough,
        has_twelve_complete_weeks: summary.hasTwelveCompleteWeeks,
        active_last_four_weeks: summary.activeLastFourWeeks,
        summary: {
          current_reach: summary.currentReach,
          previous_reach: summary.previousReach,
          current_items: summary.currentItems,
          previous_items: summary.previousItems,
          sources: summary.currentSources,
          stories: summary.currentStories,
          actions: summary.currentActions,
          change_points: summary.changePoints,
        },
      },
      computed_at: new Date().toISOString(),
    });
  }

  const remove = await admin.from("intelligence_signal_daily").delete()
    .eq("owner_id", ownerId)
    .eq("metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION)
    .gte("signal_date", startDate)
    .lte("signal_date", completeThrough);
  if (remove.error) throw new Error(remove.error.message);
  for (let index = 0; index < storedRows.length; index += 500) {
    const write = await admin.from("intelligence_signal_daily").upsert(
      storedRows.slice(index, index + 500),
      { onConflict: "owner_id,signal_key,signal_date,metric_version" },
    );
    if (write.error) throw new Error(write.error.message);
  }

  return {
    completeThrough,
    startDate,
    eligibleItemCount: items.length,
    observationCount: observations.length,
    signalCount: summaries.size,
    dailyRowCount: storedRows.length,
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
  };
}

export async function runIntelligenceV2BackfillStep(
  admin: SupabaseClient,
  ownerId: string,
  options: {
    phase?: "segmentation" | "terms" | "embeddings" | "concept_embeddings" | "topic_maintenance" | "dedupe" | "signals" | "all";
    cursor?: number;
    limit?: number;
  } = {},
) {
  const phase = options.phase ?? "all";
  if (phase === "segmentation") {
    return resegmentNewsletterBatch(
      admin,
      ownerId,
      await prepareNewsletterResegmentation(admin, ownerId),
      { cursor: options.cursor, limit: options.limit },
    );
  }
  if (phase === "embeddings") {
    return refreshSegmentEmbeddingsBatch(admin, ownerId, {
      cursor: options.cursor,
      limit: options.limit,
    });
  }
  if (phase === "concept_embeddings") {
    return refreshConceptEmbeddingsBatch(admin, ownerId, {
      cursor: options.cursor,
      limit: options.limit,
    });
  }
  if (phase === "topic_maintenance") {
    return runTopicMaintenance(admin, ownerId, {
      cursor: options.cursor,
      segmentLimit: options.limit,
    });
  }
  if (phase === "dedupe") {
    const dedupe = await rebuildStoryAndEventClustersV2(admin, ownerId);
    return { phase: "dedupe" as const, hasMore: false, nextCursor: null, dedupe };
  }
  if (phase === "signals") {
    const signals = await refreshSignalsV2(admin, ownerId);
    return { phase: "signals" as const, hasMore: false, nextCursor: null, signals };
  }
  const terms = await refreshTermObservationsBatch(admin, ownerId, {
    cursor: options.cursor,
    limit: options.limit,
  });
  if (!terms.complete) {
    return {
      phase: "terms" as const,
      hasMore: true,
      nextCursor: terms.nextCursor,
      terms,
      nextPhase: "terms" as const,
    };
  }
  if (phase === "terms") {
    return { phase: "terms" as const, hasMore: false, nextCursor: null, terms };
  }
  const signals = await refreshSignalsV2(admin, ownerId);
  return {
    phase: "signals" as const,
    hasMore: false,
    nextCursor: null,
    terms,
    signals,
  };
}

export const __testables = {
  conceptSignalKind,
  entitySignalKind,
  isMeasurementDocument,
  isMeasurementStoryCluster,
  lensKeys,
  measurementSupportsEventSubject,
  segmentSupportsLabel,
};
