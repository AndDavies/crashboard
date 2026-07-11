import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalizeExtractedConcept,
  extractCuratedConceptMentions,
  INTELLIGENCE_CONCEPT_EXTRACTION_VERSION,
  INTELLIGENCE_TAXONOMY_VERSION,
  normalizeConceptKey,
  resolveCuratedConcept,
  type CuratedConceptDefinition,
} from "@/lib/intelligence/concepts";
import { buildFallbackSegment } from "@/lib/intelligence/segments";
import { sourceIdentityDescriptor } from "@/lib/intelligence/sources";
import type {
  IntelligenceConceptType,
  IntelligenceDocumentEnvelope,
  IntelligenceDocumentSegmentInput,
  IntelligenceExtractedConcept,
  IntelligenceExtraction,
} from "@/lib/intelligence/types";

type ConceptDescriptor = {
  conceptType: IntelligenceConceptType;
  canonicalLabel: string;
  normalizedKey: string;
  domain: string;
  subdomain: string;
  aliases: string[];
  description: string;
  source: "model" | "rule" | "legacy";
  confidence: number;
};

type SegmentRecord = IntelligenceDocumentSegmentInput & { id: string };
type DocumentConceptRow = {
  owner_id: string;
  association_key: string;
  document_id: string;
  segment_id: string | null;
  concept_id: string;
  scope:
    | "title"
    | "body"
    | "segment_title"
    | "segment_body"
    | "document_theme"
    | "legacy_keyword"
    | "model";
  source: "model" | "rule" | "manual" | "legacy";
  mention_count: number;
  confidence: number;
  evidence_text: string | null;
  surface_forms: string[];
  extraction_version: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

function descriptorFromCurated(
  definition: CuratedConceptDefinition,
  source: ConceptDescriptor["source"] = "rule",
): ConceptDescriptor {
  return {
    conceptType: definition.conceptType,
    canonicalLabel: definition.canonicalLabel,
    normalizedKey: normalizeConceptKey(definition.canonicalLabel),
    domain: definition.domain,
    subdomain: definition.subdomain,
    aliases: definition.aliases,
    description: definition.description,
    source,
    confidence: source === "rule" ? 0.98 : 0.8,
  };
}

function descriptorFromExtracted(concept: IntelligenceExtractedConcept): ConceptDescriptor {
  const canonical = canonicalizeExtractedConcept(concept);
  return {
    conceptType: canonical.conceptType,
    canonicalLabel: canonical.canonicalLabel,
    normalizedKey: normalizeConceptKey(canonical.canonicalLabel),
    domain: canonical.domain,
    subdomain: canonical.subdomain,
    aliases: canonical.aliases,
    description: "",
    source: "model",
    confidence: canonical.confidence,
  };
}

function descriptorKey(descriptor: Pick<ConceptDescriptor, "conceptType" | "normalizedKey">) {
  return `${descriptor.conceptType}:${descriptor.normalizedKey}`;
}

function stringValues(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

export async function persistSourceIdentity(
  admin: SupabaseClient,
  document: IntelligenceDocumentEnvelope,
) {
  const descriptor = sourceIdentityDescriptor(document);
  const result = await admin
    .from("intelligence_source_identities")
    .upsert(
      {
        owner_id: document.ownerId,
        channel: descriptor.channel,
        canonical_name: descriptor.canonicalName,
        normalized_name: descriptor.normalizedName,
        source_family: descriptor.sourceFamily,
        normalized_family: descriptor.normalizedFamily,
        external_key: descriptor.externalKey,
        authority_tier: descriptor.authorityTier,
        metadata: { source_channel: document.sourceChannel ?? null },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,channel,normalized_name" },
    )
    .select("id")
    .single();
  if (result.error || !result.data?.id) {
    throw new Error(result.error?.message ?? "Failed to persist source identity.");
  }
  return String(result.data.id);
}

export async function persistDocumentSegments(
  admin: SupabaseClient,
  document: IntelligenceDocumentEnvelope,
  documentId: string,
) {
  const now = new Date().toISOString();
  const segments = document.segments?.length
    ? document.segments
    : [
        buildFallbackSegment({
          title: document.title,
          contentText: document.contentText,
          canonicalUrl: document.canonicalUrl,
        }),
      ];
  const result = await admin
    .from("intelligence_document_segments")
    .upsert(
      segments.map((segment) => ({
        owner_id: document.ownerId,
        document_id: documentId,
        segment_index: segment.segmentIndex,
        segment_type: segment.segmentType,
        title: segment.title,
        content_text: segment.contentText,
        outbound_url: segment.outboundUrl,
        url_host: segment.urlHost,
        content_hash: segment.contentHash,
        token_count: segment.tokenCount,
        parser_version: segment.parserVersion,
        confidence: segment.confidence,
        metadata: segment.metadata,
        updated_at: now,
      })),
      { onConflict: "document_id,segment_index" },
    )
    .select("id,segment_index");
  if (result.error) throw new Error(result.error.message);

  const currentIndexes = new Set(segments.map((segment) => segment.segmentIndex));
  const existing = await admin
    .from("intelligence_document_segments")
    .select("id,segment_index")
    .eq("owner_id", document.ownerId)
    .eq("document_id", documentId);
  if (existing.error) throw new Error(existing.error.message);
  const staleIds = (existing.data ?? [])
    .filter((row) => !currentIndexes.has(Number(row.segment_index)))
    .map((row) => String(row.id));
  if (staleIds.length) {
    const cleanup = await admin
      .from("intelligence_document_segments")
      .delete()
      .eq("owner_id", document.ownerId)
      .in("id", staleIds);
    if (cleanup.error) throw new Error(cleanup.error.message);
  }

  const byIndex = new Map<number, SegmentRecord>();
  const idByIndex = new Map(
    (result.data ?? []).map((row) => [Number(row.segment_index), String(row.id)]),
  );
  for (const segment of segments) {
    const id = idByIndex.get(segment.segmentIndex);
    if (!id) throw new Error(`Missing persisted segment ${segment.segmentIndex}.`);
    byIndex.set(segment.segmentIndex, { ...segment, id });
  }
  return byIndex;
}

async function linkedEventsForDocument(
  admin: SupabaseClient,
  ownerId: string,
  documentId: string,
) {
  const evidence = await admin
    .from("intelligence_event_evidence")
    .select("event_id")
    .eq("owner_id", ownerId)
    .eq("document_id", documentId);
  if (evidence.error) throw new Error(evidence.error.message);
  const eventIds = [...new Set((evidence.data ?? []).map((row) => String(row.event_id)))];
  if (!eventIds.length) return [];
  const events = await admin
    .from("intelligence_events")
    .select("id,metadata")
    .eq("owner_id", ownerId)
    .in("id", eventIds);
  if (events.error) throw new Error(events.error.message);
  return (events.data ?? []).map((row) => ({
    id: String(row.id),
    themes: stringValues((row.metadata as Record<string, unknown> | null)?.themes),
  }));
}

export async function persistConceptGraph(
  admin: SupabaseClient,
  input: {
    document: IntelligenceDocumentEnvelope;
    documentId: string;
    segmentsByIndex: Map<number, SegmentRecord>;
    extraction?: IntelligenceExtraction | null;
    existingThemes?: unknown;
    existingKeywords?: unknown;
  },
) {
  const { document, documentId, segmentsByIndex, extraction } = input;
  const linkedEvents = await linkedEventsForDocument(admin, document.ownerId, documentId);
  const curatedMentions = extractCuratedConceptMentions({
    title: document.title,
    contentText: document.contentText,
    segments: [...segmentsByIndex.values()],
  });
  const descriptors = new Map<string, ConceptDescriptor>();
  for (const mention of curatedMentions) {
    const descriptor = descriptorFromCurated(mention.definition);
    descriptors.set(descriptorKey(descriptor), descriptor);
  }
  for (const concept of extraction?.concepts ?? []) {
    const descriptor = descriptorFromExtracted(concept);
    if (descriptor.normalizedKey) descriptors.set(descriptorKey(descriptor), descriptor);
  }
  for (const value of [
    ...stringValues(extraction?.themes ?? input.existingThemes),
    ...linkedEvents.flatMap((event) => event.themes),
  ]) {
    const curated = resolveCuratedConcept(value);
    if (!curated) continue;
    const descriptor = descriptorFromCurated(curated, "legacy");
    descriptors.set(descriptorKey(descriptor), descriptor);
  }
  for (const value of stringValues(input.existingKeywords)) {
    const curated = resolveCuratedConcept(value);
    const descriptor = curated
      ? descriptorFromCurated(curated, "legacy")
      : {
          conceptType: "keyword" as const,
          canonicalLabel: value.trim(),
          normalizedKey: normalizeConceptKey(value),
          domain: "Unclassified",
          subdomain: "legacy keyword",
          aliases: [value.trim()],
          description: "",
          source: "legacy" as const,
          confidence: 0.65,
        };
    if (descriptor.normalizedKey) descriptors.set(descriptorKey(descriptor), descriptor);
  }

  const descriptorList = [...descriptors.values()];
  if (descriptorList.length) {
    const insertConcepts = await admin.from("intelligence_concepts").upsert(
      descriptorList.map((descriptor) => ({
        owner_id: document.ownerId,
        concept_type: descriptor.conceptType,
        canonical_label: descriptor.canonicalLabel,
        normalized_key: descriptor.normalizedKey,
        domain: descriptor.domain || null,
        subdomain: descriptor.subdomain || null,
        description: descriptor.description || null,
        taxonomy_version: INTELLIGENCE_TAXONOMY_VERSION,
        metadata: { provenance: descriptor.source },
      })),
      {
        onConflict: "owner_id,concept_type,normalized_key",
        ignoreDuplicates: true,
      },
    );
    if (insertConcepts.error) throw new Error(insertConcepts.error.message);
  }

  const conceptRows = descriptorList.length
    ? await admin
        .from("intelligence_concepts")
        .select("id,concept_type,normalized_key")
        .eq("owner_id", document.ownerId)
        .in("normalized_key", [...new Set(descriptorList.map((row) => row.normalizedKey))])
    : { data: [], error: null };
  if (conceptRows.error) throw new Error(conceptRows.error.message);
  const conceptIdByKey = new Map(
    (conceptRows.data ?? []).map((row) => [
      `${String(row.concept_type)}:${String(row.normalized_key)}`,
      String(row.id),
    ]),
  );

  const aliasRows = descriptorList.flatMap((descriptor) => {
    const conceptId = conceptIdByKey.get(descriptorKey(descriptor));
    if (!conceptId) return [];
    return [...new Map(
      [descriptor.canonicalLabel, ...descriptor.aliases]
      .map((alias) => ({ alias: alias.trim(), normalizedAlias: normalizeConceptKey(alias) }))
      .filter((alias) => alias.alias && alias.normalizedAlias)
      .map((alias) => [alias.normalizedAlias, alias]),
    ).values()]
      .map((alias) => ({
        owner_id: document.ownerId,
        concept_id: conceptId,
        alias: alias.alias,
        normalized_alias: alias.normalizedAlias,
        source: descriptor.source,
        confidence: descriptor.confidence,
      }));
  });
  if (aliasRows.length) {
    const aliases = await admin.from("intelligence_concept_aliases").upsert(aliasRows, {
      onConflict: "concept_id,normalized_alias",
      ignoreDuplicates: true,
    });
    if (aliases.error) throw new Error(aliases.error.message);
  }

  const documentRows: DocumentConceptRow[] = curatedMentions.flatMap((mention) => {
    const descriptor = descriptorFromCurated(mention.definition);
    const conceptId = conceptIdByKey.get(descriptorKey(descriptor));
    if (!conceptId) return [];
    const segmentId =
      mention.segmentIndex === null ? null : segmentsByIndex.get(mention.segmentIndex)?.id ?? null;
    return [{
      owner_id: document.ownerId,
      association_key: `${documentId}:${segmentId ?? "document"}:${conceptId}:${mention.scope}:rule`,
      document_id: documentId,
      segment_id: segmentId,
      concept_id: conceptId,
      scope: mention.scope,
      source: "rule",
      mention_count: mention.mentionCount,
      confidence: 0.98,
      evidence_text: mention.evidenceText || null,
      surface_forms: mention.surfaceForms,
      extraction_version: INTELLIGENCE_CONCEPT_EXTRACTION_VERSION,
      metadata: {},
      updated_at: new Date().toISOString(),
    }];
  });

  for (const concept of extraction?.concepts ?? []) {
    const descriptor = descriptorFromExtracted(concept);
    const conceptId = conceptIdByKey.get(descriptorKey(descriptor));
    if (!conceptId) continue;
    documentRows.push({
      owner_id: document.ownerId,
      association_key: `${documentId}:document:${conceptId}:model:model`,
      document_id: documentId,
      segment_id: null,
      concept_id: conceptId,
      scope: "model",
      source: "model",
      mention_count: 1,
      confidence: concept.confidence,
      evidence_text: concept.evidenceText || null,
      surface_forms: [concept.canonicalLabel, ...concept.aliases],
      extraction_version: INTELLIGENCE_CONCEPT_EXTRACTION_VERSION,
      metadata: { domain: concept.domain, subdomain: concept.subdomain },
      updated_at: new Date().toISOString(),
    });
  }

  const removeDocumentFacts = await admin
    .from("intelligence_document_concepts")
    .delete()
    .eq("owner_id", document.ownerId)
    .eq("document_id", documentId)
    .neq("source", "manual");
  if (removeDocumentFacts.error) throw new Error(removeDocumentFacts.error.message);
  if (documentRows.length) {
    const insertFacts = await admin.from("intelligence_document_concepts").upsert(documentRows, {
      onConflict: "owner_id,association_key",
    });
    if (insertFacts.error) throw new Error(insertFacts.error.message);
  }

  const eventRows = [...new Map(linkedEvents.flatMap((event) =>
    event.themes.flatMap((theme) => {
      const curated = resolveCuratedConcept(theme);
      if (!curated) return [];
      const descriptor = descriptorFromCurated(curated, "legacy");
      const conceptId = conceptIdByKey.get(descriptorKey(descriptor));
      if (!conceptId) return [];
      return [{
        owner_id: document.ownerId,
        association_key: `${event.id}:${conceptId}:theme:model`,
        event_id: event.id,
        concept_id: conceptId,
        relation: "theme",
        source: "model",
        confidence: 0.8,
        evidence_text: null,
        extraction_version: INTELLIGENCE_CONCEPT_EXTRACTION_VERSION,
        metadata: { surface_form: theme },
        updated_at: new Date().toISOString(),
      }];
    }),
  ).map((row) => [row.association_key, row])).values()];
  const eventIds = linkedEvents.map((event) => event.id);
  if (eventIds.length) {
    const removeEventFacts = await admin
      .from("intelligence_event_concepts")
      .delete()
      .eq("owner_id", document.ownerId)
      .in("event_id", eventIds)
      .neq("source", "manual");
    if (removeEventFacts.error) throw new Error(removeEventFacts.error.message);
  }
  if (eventRows.length) {
    const insertEventFacts = await admin.from("intelligence_event_concepts").upsert(eventRows, {
      onConflict: "owner_id,association_key",
    });
    if (insertEventFacts.error) throw new Error(insertEventFacts.error.message);
  }

  const ready = await admin
    .from("documents")
    .update({
      segment_count: segmentsByIndex.size,
      analytics_ready_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", document.ownerId)
    .eq("id", documentId);
  if (ready.error) throw new Error(ready.error.message);

  return [...new Set(conceptIdByKey.values())];
}

export const __testables = {
  descriptorFromCurated,
  descriptorFromExtracted,
  descriptorKey,
  stringValues,
};
