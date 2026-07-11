import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeConceptKey } from "@/lib/intelligence/concepts";
import {
  buildSignalWindows,
  calculateSignalMetric,
  dateKeyInTimeZone,
  INTELLIGENCE_METRIC_VERSION,
  shiftDateKey,
  withinDateWindow,
  type ActionSupport,
  type AttentionSupport,
  type EligibleDocument,
  type EligibleUnit,
  type SignalWindow,
} from "@/lib/intelligence/signal-metrics";
import { EVENT_TYPE_LABELS } from "@/lib/intelligence/taxonomy";
import type { IntelligenceEventType } from "@/lib/intelligence/types";

const PAGE_SIZE = 1_000;
const ID_QUERY_CHUNK_SIZE = 100;
const ENTITY_TREND_TYPES = new Set([
  "organization",
  "government_agency",
  "program",
  "product_system",
  "capability_technology",
]);

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type DocumentRow = {
  id: string;
  source_type: string;
  source_identity_id: string | null;
  publisher_name: string | null;
  published_at: string | null;
  ingestion_status: string;
  extraction_method: string | null;
  quality_flags: { flags?: string[] } | null;
};

type SegmentRow = {
  id: string;
  document_id: string;
  segment_type: string;
};

type SourceIdentityRow = {
  id: string;
  normalized_family: string;
  canonical_name: string;
  channel: string;
};

type ConceptRow = {
  id: string;
  concept_type: string;
  canonical_label: string;
  domain: string | null;
  subdomain: string | null;
  status: string;
  taxonomy_version: string;
};

type DocumentConceptRow = {
  document_id: string;
  segment_id: string | null;
  concept_id: string;
  mention_count: number;
  confidence: number;
  source: string;
};

type EntityRow = {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
};

type DocumentEntityRow = {
  document_id: string;
  entity_id: string;
  confidence: number;
};

type EventRow = {
  id: string;
  cluster_id: string | null;
  event_type: IntelligenceEventType;
  announced_at: string | null;
  confidence: number;
  evidence_quality: number;
  review_status: string;
};

type EvidenceRow = {
  event_id: string;
  document_id: string;
  evidence_role: string;
};

type EventConceptRow = { event_id: string; concept_id: string; confidence: number };
type EventEntityRow = { event_id: string; entity_id: string; confidence: number };
type CaseRow = { id: string; current_stage: string; title: string; confidence: number };
type CaseEventRow = {
  case_id: string;
  event_id: string;
  stage: string;
  confidence: number;
};

type Subject = {
  key: string;
  label: string;
  domain: "concept" | "entity" | "event_type" | "procurement_stage";
  attentionUnit: "document" | "segment";
  eligibility: "all" | "enriched";
  attention: Map<string, AttentionSupport>;
  actions: Map<string, ActionSupport>;
  metadata: Record<string, unknown>;
};

type GeneratedSignal = {
  row: Record<string, unknown>;
  window: SignalWindow;
  channel: string;
  alertQualified: boolean;
  log2Momentum: number;
  increaseProbability: number;
};

type SignalRefreshOptions = {
  windowOffset?: number;
  windowLimit?: number;
  currentWindowsOnly?: boolean;
};

async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<QueryResult<T>>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await queryPage(from, from + PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchAllRowsForIds<T>(
  ids: string[],
  queryPage: (ids: string[], from: number, to: number) => PromiseLike<QueryResult<T>>,
) {
  const rows: T[] = [];
  for (let idOffset = 0; idOffset < ids.length; idOffset += ID_QUERY_CHUNK_SIZE) {
    const idChunk = ids.slice(idOffset, idOffset + ID_QUERY_CHUNK_SIZE);
    rows.push(...(await fetchAllRows((from, to) => queryPage(idChunk, from, to))));
  }
  return rows;
}

function addAttention(subject: Subject, support: AttentionSupport) {
  const current = subject.attention.get(support.id);
  if (!current) {
    subject.attention.set(support.id, support);
    return;
  }
  current.mentionCount += support.mentionCount;
  current.confidence = Math.max(current.confidence, support.confidence);
}

function addAction(subject: Subject, support: ActionSupport) {
  const current = subject.actions.get(support.id);
  if (!current) {
    subject.actions.set(support.id, support);
    return;
  }
  current.documentIds = [...new Set([...current.documentIds, ...support.documentIds])];
  current.sources = [...new Set([...current.sources, ...support.sources])];
  current.channels = [...new Set([...current.channels, ...support.channels])];
  current.confidence = Math.max(current.confidence, support.confidence);
}

function subjectFactory(
  subjects: Map<string, Subject>,
  input: Omit<Subject, "attention" | "actions">,
) {
  const existing = subjects.get(input.key);
  if (existing) return existing;
  const subject: Subject = { ...input, attention: new Map(), actions: new Map() };
  subjects.set(input.key, subject);
  return subject;
}

function eventIsUsable(event: EventRow, evidence: EvidenceRow[]) {
  if (event.review_status === "rejected") return false;
  if (event.review_status === "confirmed" || event.review_status === "corrected") return true;
  return (
    Number(event.confidence) >= 0.7 &&
    Number(event.evidence_quality) >= 0.65 &&
    evidence.length >= 1
  );
}

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function channelMatches(value: string, selected: string) {
  return selected === "all" || value === selected;
}

function filterActions(
  actions: ActionSupport[],
  channel: string,
  start: string,
  end: string,
) {
  return actions.filter(
    (action) =>
      withinDateWindow(action.dateKey, start, end) &&
      (channel === "all" || action.channels.includes(channel)),
  );
}

async function replaceSignalSnapshotPeriod(
  admin: SupabaseClient,
  ownerId: string,
  window: SignalWindow,
  channel: string,
  generationStartedAt: string,
  rows: Array<Record<string, unknown>>,
) {
  const result = await admin.rpc("replace_intelligence_signal_snapshots", {
    p_owner_id: ownerId,
    p_window_type: window.windowType,
    p_channel: channel,
    p_period_start: window.periodStart,
    p_period_end: window.periodEnd,
    p_generation_started_at: generationStartedAt,
    p_rows: rows,
  });
  if (result.error) throw new Error(result.error.message);
  const data = result.data as {
    applied?: boolean;
    snapshot_count?: number;
    stale_deleted_count?: number;
  } | null;
  if (!data || typeof data.applied !== "boolean") {
    throw new Error("Signal replacement returned an invalid result.");
  }
  return {
    applied: data.applied,
    snapshotCount: Number(data.snapshot_count ?? 0),
    staleDeletedCount: Number(data.stale_deleted_count ?? 0),
  };
}

export async function refreshSignalSnapshots(
  admin: SupabaseClient,
  ownerId: string,
  anchor = new Date(),
  options: SignalRefreshOptions = {},
) {
  const generationStartedAt = new Date().toISOString();
  const [documents, sourceIdentities, concepts, entities] = await Promise.all([
    fetchAllRows<DocumentRow>((from, to) =>
      admin
        .from("documents")
        .select("id,source_type,source_identity_id,publisher_name,published_at,ingestion_status,extraction_method,quality_flags")
        .eq("owner_id", ownerId)
        .range(from, to),
    ),
    fetchAllRows<SourceIdentityRow>((from, to) =>
      admin
        .from("intelligence_source_identities")
        .select("id,normalized_family,canonical_name,channel")
        .eq("owner_id", ownerId)
        .range(from, to),
    ),
    fetchAllRows<ConceptRow>((from, to) =>
      admin
        .from("intelligence_concepts")
        .select("id,concept_type,canonical_label,domain,subdomain,status,taxonomy_version")
        .eq("owner_id", ownerId)
        .range(from, to),
    ),
    fetchAllRows<EntityRow>((from, to) =>
      admin
        .from("intelligence_entities")
        .select("id,canonical_name,entity_type,status")
        .eq("owner_id", ownerId)
        .range(from, to),
    ),
  ]);

  const sourceIdentityById = new Map(sourceIdentities.map((row) => [row.id, row]));
  const documentById = new Map<
    string,
    DocumentRow & { dateKey: string; source: string; channel: string; enriched: boolean }
  >();
  for (const document of documents) {
    const flags = document.quality_flags?.flags ?? [];
    if (
      document.ingestion_status !== "ready" ||
      !document.published_at ||
      flags.includes("enrichment_pending")
    ) {
      continue;
    }
    const sourceIdentity = document.source_identity_id
      ? sourceIdentityById.get(document.source_identity_id)
      : null;
    documentById.set(document.id, {
      ...document,
      dateKey: dateKeyInTimeZone(document.published_at),
      source:
        sourceIdentity?.normalized_family ||
        normalizeConceptKey(document.publisher_name ?? "unknown source"),
      channel: document.source_type,
      enriched: document.extraction_method === "openai_structured",
    });
  }
  if (!documentById.size) {
    throw new Error("No analytics-eligible intelligence documents are available.");
  }

  const earliestDateKey = [...documentById.values()]
    .map((document) => document.dateKey)
    .sort()[0]!;
  const allWindows = buildSignalWindows({ earliestDateKey, anchor });
  const selectableWindows = options.currentWindowsOnly
    ? [
        ...allWindows.filter((window) => window.windowType !== "weekly"),
        ...allWindows.filter((window) => window.windowType === "weekly").slice(-1),
      ]
    : allWindows;
  const windowOffset = Math.max(0, Math.floor(options.windowOffset ?? 0));
  const windowLimit = Math.max(1, Math.floor(options.windowLimit ?? selectableWindows.length));
  const windows = selectableWindows.slice(windowOffset, windowOffset + windowLimit);
  if (!windows.length) {
    throw new Error("No signal windows remain at the requested checkpoint.");
  }
  const dataStart = windows.map((window) => window.baselineStart).sort()[0]!;
  const dataEnd = windows.map((window) => window.periodEnd).sort().at(-1)!;
  for (const [documentId, document] of documentById) {
    if (!withinDateWindow(document.dateKey, dataStart, dataEnd)) {
      documentById.delete(documentId);
    }
  }
  const documentIds = [...documentById.keys()];
  const [segments, documentConcepts, documentEntities, events] = await Promise.all([
    fetchAllRowsForIds<SegmentRow>(documentIds, (ids, from, to) =>
      admin
        .from("intelligence_document_segments")
        .select("id,document_id,segment_type")
        .eq("owner_id", ownerId)
        .in("document_id", ids)
        .range(from, to),
    ),
    fetchAllRowsForIds<DocumentConceptRow>(documentIds, (ids, from, to) =>
      admin
        .from("intelligence_document_concepts")
        .select("document_id,segment_id,concept_id,mention_count,confidence,source")
        .eq("owner_id", ownerId)
        .in("document_id", ids)
        .range(from, to),
    ),
    fetchAllRowsForIds<DocumentEntityRow>(documentIds, (ids, from, to) =>
      admin
        .from("intelligence_document_entities")
        .select("document_id,entity_id,confidence")
        .eq("owner_id", ownerId)
        .in("document_id", ids)
        .range(from, to),
    ),
    fetchAllRows<EventRow>((from, to) =>
      admin
        .from("intelligence_events")
        .select("id,cluster_id,event_type,announced_at,confidence,evidence_quality,review_status")
        .eq("owner_id", ownerId)
        .gte("announced_at", `${dataStart}T00:00:00.000Z`)
        .lt("announced_at", `${shiftDateKey(dataEnd, 1)}T00:00:00.000Z`)
        .range(from, to),
    ),
  ]);
  const eventIds = events.map((event) => event.id);
  const [evidence, eventConcepts, eventEntities, caseEvents] = await Promise.all([
    fetchAllRowsForIds<EvidenceRow>(eventIds, (ids, from, to) =>
      admin
        .from("intelligence_event_evidence")
        .select("event_id,document_id,evidence_role")
        .eq("owner_id", ownerId)
        .in("event_id", ids)
        .range(from, to),
    ),
    fetchAllRowsForIds<EventConceptRow>(eventIds, (ids, from, to) =>
      admin
        .from("intelligence_event_concepts")
        .select("event_id,concept_id,confidence")
        .eq("owner_id", ownerId)
        .in("event_id", ids)
        .range(from, to),
    ),
    fetchAllRowsForIds<EventEntityRow>(eventIds, (ids, from, to) =>
      admin
        .from("intelligence_event_entities")
        .select("event_id,entity_id,confidence")
        .eq("owner_id", ownerId)
        .in("event_id", ids)
        .range(from, to),
    ),
    fetchAllRowsForIds<CaseEventRow>(eventIds, (ids, from, to) =>
      admin
        .from("intelligence_procurement_case_events")
        .select("case_id,event_id,stage,confidence")
        .eq("owner_id", ownerId)
        .in("event_id", ids)
        .range(from, to),
    ),
  ]);
  const caseIds = [...new Set(caseEvents.map((row) => row.case_id))];
  const cases = await fetchAllRowsForIds<CaseRow>(caseIds, (ids, from, to) =>
    admin
      .from("intelligence_procurement_cases")
      .select("id,current_stage,title,confidence")
      .eq("owner_id", ownerId)
      .in("id", ids)
      .range(from, to),
  );

  const segmentById = new Map<string, EligibleUnit>();
  const segmentsByDocument = new Map<string, EligibleUnit[]>();
  for (const segment of segments) {
    const document = documentById.get(segment.document_id);
    if (!document || !["editorial", "unknown"].includes(segment.segment_type)) continue;
    const unit: EligibleUnit = {
      id: segment.id,
      documentId: document.id,
      dateKey: document.dateKey,
      source: document.source,
      channel: document.channel,
    };
    segmentById.set(segment.id, unit);
    if (!segmentsByDocument.has(document.id)) segmentsByDocument.set(document.id, []);
    segmentsByDocument.get(document.id)?.push(unit);
  }
  for (const document of documentById.values()) {
    if (segmentsByDocument.has(document.id)) continue;
    const fallback: EligibleUnit = {
      id: `document:${document.id}`,
      documentId: document.id,
      dateKey: document.dateKey,
      source: document.source,
      channel: document.channel,
    };
    segmentById.set(fallback.id, fallback);
    segmentsByDocument.set(document.id, [fallback]);
  }
  const eligibleUnits = [...segmentById.values()];
  const conceptById = new Map(concepts.filter((row) => row.status === "active").map((row) => [row.id, row]));
  const entityById = new Map(
    entities
      .filter((row) => row.status === "active" && ENTITY_TREND_TYPES.has(row.entity_type))
      .map((row) => [row.id, row]),
  );
  const evidenceByEvent = new Map<string, EvidenceRow[]>();
  for (const row of evidence) {
    if (!evidenceByEvent.has(row.event_id)) evidenceByEvent.set(row.event_id, []);
    evidenceByEvent.get(row.event_id)?.push(row);
  }
  const actionByEvent = new Map<string, ActionSupport>();
  const usableEventById = new Map<string, EventRow>();
  for (const event of events) {
    const eventEvidence = evidenceByEvent.get(event.id) ?? [];
    if (!event.announced_at || !eventIsUsable(event, eventEvidence)) continue;
    const evidenceDocuments = eventEvidence
      .map((row) => documentById.get(row.document_id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (!evidenceDocuments.length) continue;
    const action: ActionSupport = {
      id: event.cluster_id ?? event.id,
      eventId: event.id,
      documentIds: uniqueStrings(evidenceDocuments.map((document) => document.id)),
      dateKey: dateKeyInTimeZone(event.announced_at),
      sources: uniqueStrings(evidenceDocuments.map((document) => document.source)),
      channels: uniqueStrings(evidenceDocuments.map((document) => document.channel)),
      confidence: (Number(event.confidence) + Number(event.evidence_quality)) / 2,
    };
    actionByEvent.set(event.id, action);
    usableEventById.set(event.id, event);
  }

  const subjects = new Map<string, Subject>();
  for (const row of documentConcepts) {
    const concept = conceptById.get(row.concept_id);
    const document = documentById.get(row.document_id);
    if (!concept || !document || Number(row.confidence) < 0.65) continue;
    const documentSegments = segmentsByDocument.get(document.id) ?? [];
    const unit = row.segment_id
      ? segmentById.get(row.segment_id)
      : documentSegments.length === 1
        ? documentSegments[0]
        : null;
    if (!unit) continue;
    const subject = subjectFactory(subjects, {
      key: `concept:${concept.id}`,
      label: concept.canonical_label,
      domain: "concept",
      attentionUnit: "segment",
      eligibility: "all",
      metadata: {
        subject_id: concept.id,
        concept_type: concept.concept_type,
        concept_domain: concept.domain,
        concept_subdomain: concept.subdomain,
        taxonomy_version: concept.taxonomy_version,
      },
    });
    addAttention(subject, {
      ...unit,
      mentionCount: Number(row.mention_count ?? 1),
      confidence: Number(row.confidence ?? 0.5),
    });
  }
  for (const row of eventConcepts) {
    const concept = conceptById.get(row.concept_id);
    const action = actionByEvent.get(row.event_id);
    if (!concept || !action) continue;
    const subject = subjectFactory(subjects, {
      key: `concept:${concept.id}`,
      label: concept.canonical_label,
      domain: "concept",
      attentionUnit: "segment",
      eligibility: "all",
      metadata: {
        subject_id: concept.id,
        concept_type: concept.concept_type,
        concept_domain: concept.domain,
        concept_subdomain: concept.subdomain,
        taxonomy_version: concept.taxonomy_version,
      },
    });
    addAction(subject, { ...action, confidence: Math.max(action.confidence, Number(row.confidence)) });
  }

  for (const row of documentEntities) {
    const entity = entityById.get(row.entity_id);
    const document = documentById.get(row.document_id);
    if (!entity || !document || Number(row.confidence) < 0.7) continue;
    const subject = subjectFactory(subjects, {
      key: `entity:${entity.id}`,
      label: entity.canonical_name,
      domain: "entity",
      attentionUnit: "document",
      eligibility: "enriched",
      metadata: { subject_id: entity.id, entity_type: entity.entity_type },
    });
    addAttention(subject, {
      id: document.id,
      documentId: document.id,
      dateKey: document.dateKey,
      source: document.source,
      channel: document.channel,
      mentionCount: 1,
      confidence: Number(row.confidence),
    });
  }
  for (const row of eventEntities) {
    const entity = entityById.get(row.entity_id);
    const action = actionByEvent.get(row.event_id);
    if (!entity || !action) continue;
    const subject = subjectFactory(subjects, {
      key: `entity:${entity.id}`,
      label: entity.canonical_name,
      domain: "entity",
      attentionUnit: "document",
      eligibility: "enriched",
      metadata: { subject_id: entity.id, entity_type: entity.entity_type },
    });
    addAction(subject, { ...action, confidence: Math.max(action.confidence, Number(row.confidence)) });
  }

  for (const [eventId, event] of usableEventById) {
    const action = actionByEvent.get(eventId);
    if (!action) continue;
    const subject = subjectFactory(subjects, {
      key: `event:${event.event_type}`,
      label: EVENT_TYPE_LABELS[event.event_type],
      domain: "event_type",
      attentionUnit: "document",
      eligibility: "enriched",
      metadata: { event_type: event.event_type },
    });
    for (const documentId of action.documentIds) {
      const document = documentById.get(documentId);
      if (!document) continue;
      addAttention(subject, {
        id: document.id,
        documentId: document.id,
        dateKey: document.dateKey,
        source: document.source,
        channel: document.channel,
        mentionCount: 1,
        confidence: action.confidence,
      });
    }
    addAction(subject, action);
  }

  const caseById = new Map(cases.map((row) => [row.id, row]));
  for (const row of caseEvents) {
    const procurementCase = caseById.get(row.case_id);
    const action = actionByEvent.get(row.event_id);
    if (!procurementCase || !action) continue;
    const subject = subjectFactory(subjects, {
      key: `procurement-stage:${row.stage}`,
      label: row.stage.replaceAll("_", " "),
      domain: "procurement_stage",
      attentionUnit: "document",
      eligibility: "enriched",
      metadata: { procurement_stage: row.stage },
    });
    for (const documentId of action.documentIds) {
      const document = documentById.get(documentId);
      if (!document) continue;
      addAttention(subject, {
        id: document.id,
        documentId: document.id,
        dateKey: document.dateKey,
        source: document.source,
        channel: document.channel,
        mentionCount: 1,
        confidence: Math.max(action.confidence, Number(row.confidence)),
      });
    }
    addAction(subject, {
      ...action,
      id: `${row.case_id}:${action.id}`,
      confidence: Math.max(action.confidence, Number(row.confidence)),
    });
  }

  for (const [key, subject] of subjects) {
    if (subject.domain !== "entity") continue;
    const sources = new Set([...subject.attention.values()].map((support) => support.source));
    const documents = new Set(
      [...subject.attention.values()].map((support) => support.documentId),
    );
    if (documents.size < 3 && subject.actions.size === 0) subjects.delete(key);
    else if (sources.size < 2 && subject.actions.size === 0) subjects.delete(key);
  }

  const channels = ["all", ...new Set([...documentById.values()].map((row) => row.channel))];
  const generated: GeneratedSignal[] = [];
  let snapshotCount = 0;
  let staleDeletedCount = 0;
  let supersededCount = 0;

  for (const window of windows) {
    for (const channel of channels) {
      const rows: Array<Record<string, unknown>> = [];
      for (const subject of subjects.values()) {
        const eligibleDocumentSource = [...documentById.values()].filter(
          (document) => subject.eligibility === "all" || document.enriched,
        );
        const channelDocuments = eligibleDocumentSource.filter((document) =>
          channelMatches(document.channel, channel),
        );
        const channelDocumentIds = new Set(channelDocuments.map((document) => document.id));
        const channelUnits = eligibleUnits.filter(
          (unit) => channelDocumentIds.has(unit.documentId) && channelMatches(unit.channel, channel),
        );
        const attention = [...subject.attention.values()].filter(
          (support) =>
            channelDocumentIds.has(support.documentId) && channelMatches(support.channel, channel),
        );
        const actions = [...subject.actions.values()];
        const currentAttention = attention.filter((support) =>
          withinDateWindow(support.dateKey, window.periodStart, window.periodEnd),
        );
        const currentActions = filterActions(
          actions,
          channel,
          window.periodStart,
          window.periodEnd,
        );
        if (!currentAttention.length && !currentActions.length) continue;
        const metric = calculateSignalMetric({
          window,
          attentionUnit: subject.attentionUnit,
          currentDocuments: channelDocuments
            .filter((document) =>
              withinDateWindow(document.dateKey, window.periodStart, window.periodEnd),
            )
            .map(toEligibleDocument),
          baselineDocuments: channelDocuments
            .filter((document) =>
              withinDateWindow(document.dateKey, window.baselineStart, window.baselineEnd),
            )
            .map(toEligibleDocument),
          currentUnits: channelUnits.filter((unit) =>
            withinDateWindow(unit.dateKey, window.periodStart, window.periodEnd),
          ),
          baselineUnits: channelUnits.filter((unit) =>
            withinDateWindow(unit.dateKey, window.baselineStart, window.baselineEnd),
          ),
          currentAttention,
          baselineAttention: attention.filter((support) =>
            withinDateWindow(support.dateKey, window.baselineStart, window.baselineEnd),
          ),
          currentActions,
          baselineActions: filterActions(
            actions,
            channel,
            window.baselineStart,
            window.baselineEnd,
          ),
        });
        const row: Record<string, unknown> = {
          trend_key: subject.key,
          trend_label: subject.label,
          domain: subject.domain,
          document_count: metric.documentCount,
          cluster_count: metric.clusterCount,
          event_count: metric.eventCount,
          independent_source_count: metric.independentSourceCount,
          mention_rate: round(metric.mentionRate),
          event_rate: round(metric.eventRate),
          momentum: round(metric.momentum),
          source_diversity: round(metric.sourceDiversity),
          persistence: round(metric.persistence),
          evidence_confidence: round(metric.evidenceConfidence),
          trend_strength: metric.trendStrength,
          novelty: metric.novelty,
          eligible_document_count: metric.eligibleDocumentCount,
          supporting_document_count: metric.supportingDocumentCount,
          mention_count: metric.mentionCount,
          baseline_document_count: metric.baselineDocumentCount,
          baseline_supporting_document_count: metric.baselineSupportingDocumentCount,
          baseline_event_count: metric.baselineEventCount,
          baseline_source_count: metric.baselineSourceCount,
          publisher_concentration: round(metric.publisherConcentration),
          effective_source_count: round(metric.effectiveSourceCount),
          source_overlap: round(metric.sourceOverlap),
          confidence_low: round(metric.confidenceLow),
          confidence_high: round(metric.confidenceHigh),
          metric_version: INTELLIGENCE_METRIC_VERSION,
          taxonomy_version: String(subject.metadata.taxonomy_version ?? "signal-taxonomy-v1"),
          extraction_version: "mixed",
          qualification_status: metric.qualificationStatus,
          metadata: {
            ...subject.metadata,
            baseline_start: window.baselineStart,
            baseline_end: window.baselineEnd,
            eligible_unit_count: metric.eligibleUnitCount,
            supporting_unit_count: metric.supportingUnitCount,
            baseline_unit_count: metric.baselineUnitCount,
            baseline_supporting_unit_count: metric.baselineSupportingUnitCount,
            document_prevalence: round(metric.documentPrevalence),
            baseline_document_prevalence: round(metric.baselineDocumentPrevalence),
            balanced_prevalence: round(metric.balancedPrevalence),
            baseline_balanced_prevalence: round(metric.baselineBalancedPrevalence),
            baseline_mention_rate: round(metric.baselineMentionRate),
            baseline_event_rate: round(metric.baselineEventRate),
            log2_momentum: round(metric.log2Momentum),
            absolute_delta: round(metric.absoluteDelta),
            increase_probability: round(metric.increaseProbability),
            concentration_warning: metric.concentrationWarning,
            alert_qualified: metric.alertQualified,
          },
        };
        rows.push(row);
        generated.push({
          row,
          window,
          channel,
          alertQualified: metric.alertQualified,
          log2Momentum: metric.log2Momentum,
          increaseProbability: metric.increaseProbability,
        });
      }
      const replacement = await replaceSignalSnapshotPeriod(
        admin,
        ownerId,
        window,
        channel,
        generationStartedAt,
        rows,
      );
      snapshotCount += replacement.snapshotCount;
      staleDeletedCount += replacement.staleDeletedCount;
      if (!replacement.applied) supersededCount += 1;
    }
  }

  const operatingSignals = generated.filter(
    (signal) => signal.window.windowType === "operating" && signal.channel === "all",
  );
  if (operatingSignals.length) {
    const dismissOldAlerts = await admin
      .from("intelligence_alerts")
      .update({ status: "dismissed" })
      .eq("owner_id", ownerId)
      .eq("status", "unread")
      .is("watchlist_id", null)
      .is("event_id", null);
    if (dismissOldAlerts.error) throw new Error(dismissOldAlerts.error.message);

    for (const signal of operatingSignals.filter((candidate) => candidate.alertQualified)) {
      const row = signal.row;
      const alert = await admin.from("intelligence_alerts").upsert(
        {
          owner_id: ownerId,
          severity: Number(row.trend_strength) >= 85 ? "urgent" : "notable",
          title: `${String(row.trend_label)} is accelerating`,
          summary: `${Number(row.supporting_document_count)} supporting documents across ${Number(row.independent_source_count)} source families; ${round(signal.increaseProbability * 100, 1)}% probability of increase.`,
          dedupe_key: `signal:${String(row.trend_key)}:${signal.window.periodEnd}:${INTELLIGENCE_METRIC_VERSION}`,
        },
        { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
      );
      if (alert.error) throw new Error(alert.error.message);
    }

    const watchlists = await admin
      .from("intelligence_watchlists")
      .select("id,name,rules")
      .eq("owner_id", ownerId)
      .eq("enabled", true);
    if (watchlists.error) throw new Error(watchlists.error.message);
    for (const watchlist of watchlists.data ?? []) {
      const rules = (watchlist.rules ?? {}) as {
        terms?: string[];
        minimumStrength?: number;
      };
      const terms = (rules.terms ?? []).map((term) => normalizeConceptKey(term));
      for (const signal of operatingSignals) {
        const row = signal.row;
        if (String(row.qualification_status) !== "qualified") continue;
        if (Number(row.trend_strength) < Number(rules.minimumStrength ?? 65)) continue;
        if (
          terms.length &&
          !terms.some((term) => normalizeConceptKey(String(row.trend_label)).includes(term))
        ) {
          continue;
        }
        const alert = await admin.from("intelligence_alerts").upsert(
          {
            owner_id: ownerId,
            watchlist_id: watchlist.id,
            severity: Number(row.trend_strength) >= 85 ? "urgent" : "notable",
            title: `${watchlist.name}: ${String(row.trend_label)}`,
            summary: `${Number(row.supporting_document_count)} supporting documents across ${Number(row.independent_source_count)} source families.`,
            dedupe_key: `watchlist:${watchlist.id}:signal:${String(row.trend_key)}:${signal.window.periodEnd}`,
          },
          { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
        );
        if (alert.error) throw new Error(alert.error.message);
      }
    }
  }

  const nextWindowOffset = Math.min(selectableWindows.length, windowOffset + windows.length);
  return {
    snapshotCount,
    staleDeletedCount,
    superseded: supersededCount > 0,
    supersededCount,
    periodStart: windows.map((window) => window.periodStart).sort()[0] ?? null,
    periodEnd: windows.map((window) => window.periodEnd).sort().at(-1) ?? null,
    windowCount: windows.length,
    totalWindowCount: selectableWindows.length,
    nextWindowOffset,
    hasMore: nextWindowOffset < selectableWindows.length,
    channelCount: channels.length,
    subjectCount: subjects.size,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function toEligibleDocument(document: {
  id: string;
  dateKey: string;
  source: string;
  channel: string;
}): EligibleDocument {
  return {
    id: document.id,
    dateKey: document.dateKey,
    source: document.source,
    channel: document.channel,
  };
}

export const __testables = {
  addAction,
  addAttention,
  eventIsUsable,
  fetchAllRows,
  fetchAllRowsForIds,
  filterActions,
  replaceSignalSnapshotPeriod,
};
