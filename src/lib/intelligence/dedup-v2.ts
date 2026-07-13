import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/ingestion/hash";
import { normalizeSourceUrl } from "@/lib/intelligence/source-url";
import {
  isMeasurementDocument,
  sourceIdFromDocument,
} from "@/lib/intelligence/source-cohort";

type DbRow = Record<string, unknown>;
type DedupCohort = "measurement" | "non_measurement";
const DAY_MS = 86_400_000;

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1_000) {
    const result = await query(from, from + 999);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < 1_000) return rows;
  }
}

async function loadDocumentCohorts(admin: SupabaseClient, ownerId: string) {
  const [documents, identities, sources] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin.from("documents")
      .select("id,published_at,created_at,source_identity_id,metadata")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_source_identities")
      .select("id,source_id").eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_sources")
      .select("id,status,cohort,measurement_active_from")
      .eq("owner_id", ownerId).range(from, to)),
  ]);
  const identityById = new Map(identities.map((row) => [String(row.id), row]));
  const sourceById = new Map(sources.map((row) => [String(row.id), row]));
  return new Map(documents.map((document) => {
    const identity = identityById.get(String(document.source_identity_id ?? "")) ?? {};
    const source = sourceById.get(sourceIdFromDocument(document, identity)) ?? {};
    const publishedAt = String(document.published_at ?? document.created_at ?? "");
    const cohort: DedupCohort = isMeasurementDocument({
      document,
      identity,
      source,
      publishedAt,
    }) ? "measurement" : "non_measurement";
    return [String(document.id), cohort] as const;
  }));
}

function normalizedWords(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-CA")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length >= 3 && !["the", "and", "for", "with", "from", "into", "new"].includes(word))
    .map((word) => {
      if (/^award(?:ed|ing|s)?$/u.test(word)) return "award";
      if (/^announc(?:e|ed|es|ing|ement)$/u.test(word)) return "announce";
      if (/^deploy(?:ed|ing|ment|ments|s)?$/u.test(word)) return "deploy";
      if (/^trial(?:led|ing|s)?$/u.test(word)) return "trial";
      return word;
    });
}

export function titleSimilarity(a: unknown, b: unknown) {
  const left = new Set(normalizedWords(a));
  const right = new Set(normalizedWords(b));
  if (!left.size || !right.size) return 0;
  const overlap = [...left].filter((word) => right.has(word)).length;
  return overlap / (left.size + right.size - overlap);
}

function eventDay(row: DbRow) {
  return String(row.announced_at ?? row.occurred_at ?? "").slice(0, 10);
}

function daysApart(a: string, b: string) {
  return Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / DAY_MS;
}

class DisjointSet {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string) {
    const left = this.find(a);
    const right = this.find(b);
    if (left === right) return;
    const root = left < right ? left : right;
    this.parent.set(left === root ? right : left, root);
  }
}

function storyExactKey(row: DbRow) {
  return storyExactKeys(row)[0] ?? null;
}

function storyExactKeys(row: DbRow) {
  const keys: string[] = [];
  const url = normalizeSourceUrl(String(
    row.outbound_url ?? row.canonical_url ?? row.original_url ?? "",
  ));
  if (url) keys.push(`url:${url}`);
  const hash = String(row.content_hash ?? "").trim();
  if (hash) keys.push(`hash:${hash}`);
  return keys;
}

function embeddingVector(value: unknown) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value !== "string") return [];
  return value.replace(/^\[|\]$/gu, "").split(",").map(Number).filter(Number.isFinite);
}

function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    left += a[index] ** 2;
    right += b[index] ** 2;
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}

function groupsFromSet(rows: DbRow[], set: DisjointSet) {
  const groups = new Map<string, DbRow[]>();
  for (const row of rows) {
    const root = set.find(String(row.id));
    const group = groups.get(root) ?? [];
    group.push(row);
    groups.set(root, group);
  }
  return [...groups.values()];
}

type StoryReviewCandidate = {
  left: DbRow;
  right: DbRow;
  titleScore: number;
  embeddingScore: number;
};

function dedupCohort(row: DbRow): DedupCohort {
  return row.dedup_cohort === "measurement" ? "measurement" : "non_measurement";
}

function groupStoryCandidates(input: {
  segments: DbRow[];
  vectors: Map<string, number[]>;
  principalsByDocument: Map<string, Set<string>>;
  eventTypesByDocument: Map<string, Set<string>>;
}) {
  const set = new DisjointSet();
  const reviewCandidates: StoryReviewCandidate[] = [];
  const exactOwner = new Map<string, string>();
  for (const segment of input.segments) {
    const id = String(segment.id);
    const cohort = dedupCohort(segment);
    set.add(id);
    for (const exact of storyExactKeys(segment)) {
      const cohortExact = `${cohort}|${exact}`;
      if (exactOwner.has(cohortExact)) set.union(id, exactOwner.get(cohortExact)!);
      else exactOwner.set(cohortExact, id);
    }
  }
  for (let left = 0; left < input.segments.length; left += 1) {
    const leftSegment = input.segments[left];
    const leftDate = String(leftSegment.published_at).slice(0, 10);
    for (let right = left + 1; right < input.segments.length; right += 1) {
      const rightSegment = input.segments[right];
      const rightDate = String(rightSegment.published_at).slice(0, 10);
      if (daysApart(leftDate, rightDate) > 7) {
        if (rightDate > leftDate) break;
        continue;
      }
      if (dedupCohort(leftSegment) !== dedupCohort(rightSegment)) continue;
      const leftPrincipals = input.principalsByDocument.get(String(leftSegment.document_id)) ?? new Set<string>();
      const rightPrincipals = input.principalsByDocument.get(String(rightSegment.document_id)) ?? new Set<string>();
      const sharesPrincipal = [...leftPrincipals].some((id) => rightPrincipals.has(id));
      const leftEventTypes = input.eventTypesByDocument.get(String(leftSegment.document_id)) ?? new Set<string>();
      const rightEventTypes = input.eventTypesByDocument.get(String(rightSegment.document_id)) ?? new Set<string>();
      const hasCompatibleEvent = [...leftEventTypes].some((eventType) => rightEventTypes.has(eventType));
      if (sharesPrincipal && hasCompatibleEvent) {
        set.union(String(leftSegment.id), String(rightSegment.id));
        continue;
      }
      const titleScore = titleSimilarity(leftSegment.story_title, rightSegment.story_title);
      if (titleScore < 0.5) continue;
      const leftVector = input.vectors.get(String(leftSegment.id)) ?? [];
      const rightVector = input.vectors.get(String(rightSegment.id)) ?? [];
      const embeddingScore = cosineSimilarity(leftVector, rightVector);
      if (embeddingScore >= 0.86) {
        set.union(String(leftSegment.id), String(rightSegment.id));
      } else if (embeddingScore >= 0.8) {
        reviewCandidates.push({
          left: leftSegment,
          right: rightSegment,
          titleScore,
          embeddingScore,
        });
      }
    }
  }
  return {
    groups: groupsFromSet(input.segments, set),
    reviewCandidates: reviewCandidates.filter((candidate) =>
      set.find(String(candidate.left.id)) !== set.find(String(candidate.right.id))
    ),
  };
}

async function rebuildStoryClusters(
  admin: SupabaseClient,
  ownerId: string,
  documentCohorts: Map<string, DedupCohort>,
) {
  const [segmentRows, embeddingRows, existingRows, documentEntityRows, entityRows,
    eventEvidenceRows, eventRows] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_segments")
      .select("id,document_id,title,outbound_url,content_hash,confidence,documents!inner(title,published_at)")
      .eq("owner_id", ownerId).in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null).order("id", { ascending: true }).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_segment_embeddings")
      .select("segment_id,embedding").eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_clusters").select("id,metadata")
      .eq("owner_id", ownerId).in("cluster_type", ["story", "story_review"]).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_entities")
      .select("document_id,entity_id,confidence").eq("owner_id", ownerId)
      .gte("confidence", 0.65).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_entities")
      .select("id,entity_type").eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_evidence")
      .select("event_id,document_id").eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,event_type,review_status").eq("owner_id", ownerId)
      .neq("event_type", "other").neq("review_status", "rejected").range(from, to)),
  ]);
  const staleV2Ids = existingRows.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? row.metadata as Record<string, unknown>
      : {};
    return ["story-dedup-v2.0.0", "story-review-v2.0.0"].includes(String(metadata.dedupe_version));
  }).map((row) => String(row.id));
  const vectors = new Map(
    embeddingRows.map((row) => [String(row.segment_id), embeddingVector(row.embedding)]),
  );
  const principalEntityTypes = new Set([
    "organization", "government_agency", "program", "product_system", "capability_technology",
  ]);
  const entityTypeById = new Map(entityRows.map((row) => [String(row.id), String(row.entity_type)]));
  const principalsByDocument = new Map<string, Set<string>>();
  for (const row of documentEntityRows) {
    if (!principalEntityTypes.has(entityTypeById.get(String(row.entity_id)) ?? "")) continue;
    const documentId = String(row.document_id);
    const values = principalsByDocument.get(documentId) ?? new Set<string>();
    values.add(String(row.entity_id));
    principalsByDocument.set(documentId, values);
  }
  const eventTypeById = new Map(eventRows.map((row) => [String(row.id), String(row.event_type)]));
  const measurementEventIds = new Set(eventEvidenceRows
    .filter((row) => documentCohorts.get(String(row.document_id)) === "measurement")
    .map((row) => String(row.event_id)));
  const eventTypesByDocument = new Map<string, Set<string>>();
  for (const row of eventEvidenceRows) {
    const eventId = String(row.event_id);
    const eventType = eventTypeById.get(eventId);
    if (!eventType) continue;
    const documentId = String(row.document_id);
    const documentCohort = documentCohorts.get(documentId) ?? "non_measurement";
    const eventCohort: DedupCohort = measurementEventIds.has(eventId)
      ? "measurement"
      : "non_measurement";
    if (documentCohort !== eventCohort) continue;
    const values = eventTypesByDocument.get(documentId) ?? new Set<string>();
    values.add(eventType);
    eventTypesByDocument.set(documentId, values);
  }
  const segments = segmentRows.map((segment) => {
    const document = Array.isArray(segment.documents) ? segment.documents[0] : segment.documents;
    const value = document && typeof document === "object" ? document as DbRow : {};
    return {
      ...segment,
      published_at: value.published_at,
      document_title: value.title,
      story_title: segment.title ?? value.title,
      dedup_cohort: documentCohorts.get(String(segment.document_id)) ?? "non_measurement",
    } as DbRow;
  }).filter((segment) => Boolean(segment.published_at))
    .sort((a, b) => String(a.published_at).localeCompare(String(b.published_at)));
  const { groups, reviewCandidates } = groupStoryCandidates({
    segments,
    vectors,
    principalsByDocument,
    eventTypesByDocument,
  });
  const clusterRows = groups.map((group) => {
    const canonical = [...group].sort((a, b) =>
      Number(b.confidence ?? 0) - Number(a.confidence ?? 0) ||
      String(a.published_at).localeCompare(String(b.published_at))
    )[0];
    const cohort = dedupCohort(canonical);
    const fingerprint = sha256Hex(
      `story|${cohort}|${group.map((row) => String(row.id)).sort().join("|")}`,
    );
    return {
      owner_id: ownerId,
      cluster_type: "story",
      canonical_document_id: canonical.document_id,
      fingerprint,
      title: canonical.story_title,
      metadata: {
        member_count: group.length,
        canonical_segment_id: canonical.id,
        dedupe_version: "story-dedup-v2.0.0",
        dedup_cohort: cohort,
        measurement_eligible: cohort === "measurement",
      },
      updated_at: new Date().toISOString(),
      group,
    };
  });
  const clusterByFingerprint = new Map<string, string>();
  for (let index = 0; index < clusterRows.length; index += 500) {
    const writeClusters = await admin.from("intelligence_clusters").upsert(
      clusterRows.slice(index, index + 500).map(({ group, ...row }) => {
        if (!group.length) throw new Error("Story cluster cannot be empty.");
        return row;
      }),
      { onConflict: "owner_id,cluster_type,fingerprint" },
    ).select("id,fingerprint");
    if (writeClusters.error) throw new Error(writeClusters.error.message);
    for (const row of writeClusters.data ?? []) {
      clusterByFingerprint.set(String(row.fingerprint), String(row.id));
    }
  }
  const documentRows = clusterRows.flatMap((cluster) => {
    const clusterId = clusterByFingerprint.get(cluster.fingerprint)!;
    return [...new Map(cluster.group.map((segment) => [String(segment.document_id), segment])).values()]
      .map((segment) => ({
      owner_id: ownerId,
      cluster_id: clusterId,
      document_id: segment.document_id,
      relationship: segment.document_id === cluster.canonical_document_id ? "canonical" : "supporting",
    }));
  });
  for (let index = 0; index < documentRows.length; index += 500) {
    const write = await admin.from("intelligence_cluster_documents").upsert(
      documentRows.slice(index, index + 500),
      { onConflict: "cluster_id,document_id" },
    );
    if (write.error) throw new Error(write.error.message);
  }
  const segmentMembershipRows = clusterRows.flatMap((cluster) => {
    const clusterId = clusterByFingerprint.get(cluster.fingerprint)!;
    const canonicalSegmentId = String((cluster.metadata as { canonical_segment_id: unknown }).canonical_segment_id);
    return cluster.group.map((segment) => ({
      owner_id: ownerId,
      cluster_id: clusterId,
      segment_id: segment.id,
      relationship: String(segment.id) === canonicalSegmentId ? "canonical" : "member",
    }));
  });
  for (let index = 0; index < segmentMembershipRows.length; index += 500) {
    const write = await admin.from("intelligence_cluster_segments").upsert(
      segmentMembershipRows.slice(index, index + 500),
      { onConflict: "cluster_id,segment_id" },
    );
    if (write.error) throw new Error(write.error.message);
  }
  const reviewClusterRows = reviewCandidates.map((candidate) => {
    const segmentIds = [String(candidate.left.id), String(candidate.right.id)].sort();
    return {
      owner_id: ownerId,
      cluster_type: "story_review",
      canonical_document_id: candidate.left.document_id,
      fingerprint: sha256Hex(`story-review|${segmentIds.join("|")}`),
      title: candidate.left.story_title,
      metadata: {
        member_count: 2,
        segment_ids: segmentIds,
        title_similarity: candidate.titleScore,
        embedding_similarity: candidate.embeddingScore,
        dedupe_version: "story-review-v2.0.0",
        dedup_cohort: dedupCohort(candidate.left),
        measurement_eligible: dedupCohort(candidate.left) === "measurement",
      },
      updated_at: new Date().toISOString(),
      candidate,
    };
  });
  const reviewClusterByFingerprint = new Map<string, string>();
  for (let index = 0; index < reviewClusterRows.length; index += 500) {
    const write = await admin.from("intelligence_clusters").upsert(
      reviewClusterRows.slice(index, index + 500).map(({ candidate, ...row }) => {
        if (!candidate.left.id || !candidate.right.id) throw new Error("Review pair cannot be empty.");
        return row;
      }),
      { onConflict: "owner_id,cluster_type,fingerprint" },
    ).select("id,fingerprint");
    if (write.error) throw new Error(write.error.message);
    for (const row of write.data ?? []) {
      reviewClusterByFingerprint.set(String(row.fingerprint), String(row.id));
    }
  }
  const reviewSegmentRows = reviewClusterRows.flatMap((cluster) => {
    const clusterId = reviewClusterByFingerprint.get(cluster.fingerprint)!;
    return [cluster.candidate.left, cluster.candidate.right].map((segment) => ({
      owner_id: ownerId,
      cluster_id: clusterId,
      segment_id: segment.id,
      relationship: "review_candidate",
    }));
  });
  for (let index = 0; index < reviewSegmentRows.length; index += 500) {
    const write = await admin.from("intelligence_cluster_segments").upsert(
      reviewSegmentRows.slice(index, index + 500),
      { onConflict: "cluster_id,segment_id" },
    );
    if (write.error) throw new Error(write.error.message);
  }
  // Keep the last complete cluster set available until every replacement and
  // membership write succeeds. Upserted fingerprints reuse their existing IDs;
  // only obsolete v2 clusters are removed after the replacement is complete.
  const replacementClusterIds = new Set([
    ...clusterByFingerprint.values(),
    ...reviewClusterByFingerprint.values(),
  ]);
  const obsoleteV2Ids = staleV2Ids.filter((id) => !replacementClusterIds.has(id));
  for (let index = 0; index < obsoleteV2Ids.length; index += 100) {
    const remove = await admin.from("intelligence_clusters").delete()
      .eq("owner_id", ownerId).in("id", obsoleteV2Ids.slice(index, index + 100));
    if (remove.error) throw new Error(remove.error.message);
  }
  return {
    storyClusters: clusterRows.length,
    storySegmentMemberships: segmentMembershipRows.length,
    storyDocumentMemberships: documentRows.length,
    storyReviewCandidates: reviewClusterRows.length,
  };
}

function groupEventCandidates(input: {
  events: DbRow[];
  cohortByEvent: Map<string, DedupCohort>;
  principal: (eventId: string) => string | null;
}) {
  const set = new DisjointSet();
  for (const event of input.events) set.add(String(event.id));
  for (let left = 0; left < input.events.length; left += 1) {
    for (let right = left + 1; right < input.events.length; right += 1) {
      const leftEvent = input.events[left];
      const rightEvent = input.events[right];
      if (leftEvent.event_type !== rightEvent.event_type) continue;
      if (daysApart(eventDay(leftEvent), eventDay(rightEvent)) > 7) continue;
      const leftCohort = input.cohortByEvent.get(String(leftEvent.id)) ?? "non_measurement";
      const rightCohort = input.cohortByEvent.get(String(rightEvent.id)) ?? "non_measurement";
      if (leftCohort !== rightCohort) continue;
      const leftPrincipal = input.principal(String(leftEvent.id));
      const rightPrincipal = input.principal(String(rightEvent.id));
      if (leftPrincipal && leftPrincipal === rightPrincipal) {
        set.union(String(leftEvent.id), String(rightEvent.id));
      } else if (!leftPrincipal && !rightPrincipal &&
        titleSimilarity(leftEvent.title, rightEvent.title) >= 0.86) {
        set.union(String(leftEvent.id), String(rightEvent.id));
      }
    }
  }
  return groupsFromSet(input.events, set);
}

function cohortAlignedEvidenceDocumentIds(input: {
  eventId: string;
  cohortByEvent: Map<string, DedupCohort>;
  evidenceByEvent: Map<string, DbRow[]>;
  documentCohorts: Map<string, DedupCohort>;
}) {
  const cohort = input.cohortByEvent.get(input.eventId) ?? "non_measurement";
  return (input.evidenceByEvent.get(input.eventId) ?? [])
    .map((row) => String(row.document_id))
    .filter((documentId) =>
      (input.documentCohorts.get(documentId) ?? "non_measurement") === cohort
    );
}

function principalEntity(
  values: Array<{ id: string; type: string; role: string }>,
) {
  return [...values]
    .filter((value) =>
      ["program", "product_system", "capability_technology", "government_agency"].includes(value.type) ||
      (value.type === "organization" && /buyer|customer|agency|operator|subject/iu.test(value.role))
    )
    .sort((a, b) => {
      const score = (value: { type: string; role: string }) =>
        ["program", "product_system", "capability_technology"].includes(value.type) ? 3 :
          /buyer|customer|agency|operator|subject/iu.test(value.role) ? 2 : 1;
      return score(b) - score(a);
    })[0]?.id ?? null;
}

async function rebuildEventClusters(
  admin: SupabaseClient,
  ownerId: string,
  completeThrough: string,
  documentCohorts: Map<string, DedupCohort>,
) {
  const [eventRows, evidenceRowsInput, entityRows, conceptRowsInput,
    allEventEntityRows, documentConceptRows,
    documentEntityRows] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,title,event_type,announced_at,occurred_at,confidence,cluster_id,review_status,metadata")
      .eq("owner_id", ownerId).neq("event_type", "other").neq("review_status", "rejected")
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_evidence").select("*")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_entities").select("id,entity_type")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_concepts").select("*")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_entities").select("*")
      .eq("owner_id", ownerId).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_concepts")
      .select("document_id,concept_id,confidence,evidence_text")
      .eq("owner_id", ownerId).gte("confidence", 0.65).range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_entities")
      .select("document_id,entity_id,role,confidence,evidence_text")
      .eq("owner_id", ownerId).gte("confidence", 0.65).range(from, to)),
  ]);
  const evidenceByEvent = new Map<string, DbRow[]>();
  for (const row of evidenceRowsInput) {
    const values = evidenceByEvent.get(String(row.event_id)) ?? [];
    values.push(row);
    evidenceByEvent.set(String(row.event_id), values);
  }
  const cohortByEvent = new Map<string, DedupCohort>();
  for (const event of eventRows) {
    const evidence = evidenceByEvent.get(String(event.id)) ?? [];
    cohortByEvent.set(
      String(event.id),
      evidence.some((row) =>
        documentCohorts.get(String(row.document_id)) === "measurement"
      ) ? "measurement" : "non_measurement",
    );
  }
  const documentConcepts = new Map<string, DbRow[]>();
  for (const row of documentConceptRows) {
    const values = documentConcepts.get(String(row.document_id)) ?? [];
    values.push(row as DbRow);
    documentConcepts.set(String(row.document_id), values);
  }
  const documentEntities = new Map<string, DbRow[]>();
  for (const row of documentEntityRows) {
    const values = documentEntities.get(String(row.document_id)) ?? [];
    values.push(row as DbRow);
    documentEntities.set(String(row.document_id), values);
  }
  const eventConceptRows: DbRow[] = [...conceptRowsInput];
  const eventEntityRowsAll: DbRow[] = [...allEventEntityRows];
  const conceptLinked = new Set(eventConceptRows.map((row) => String(row.event_id)));
  const entityLinked = new Set(eventEntityRowsAll.map((row) => String(row.event_id)));
  const inferredConceptRows: DbRow[] = [];
  const inferredEntityRows: DbRow[] = [];
  for (const event of eventRows) {
    const eventId = String(event.id);
    const evidenceDocuments = cohortAlignedEvidenceDocumentIds({
      eventId,
      cohortByEvent,
      evidenceByEvent,
      documentCohorts,
    });
    if (!conceptLinked.has(eventId)) {
      const concepts = [...new Map(
        evidenceDocuments.flatMap((documentId) => documentConcepts.get(documentId) ?? [])
          .map((row) => [String(row.concept_id), row]),
      ).values()].slice(0, 6);
      inferredConceptRows.push(...concepts.map((row) => ({
        owner_id: ownerId,
        association_key: sha256Hex(`${eventId}|${row.concept_id}|evidence-link-v2`),
        event_id: eventId,
        concept_id: row.concept_id,
        relation: "subject",
        source: "rule",
        confidence: Math.min(0.9, Number(row.confidence ?? 0.65) * 0.9),
        evidence_text: row.evidence_text ?? null,
        extraction_version: "event-evidence-link-v2.0.0",
        metadata: { inferred_from_evidence_document: true },
        updated_at: new Date().toISOString(),
      })));
    }
    if (!entityLinked.has(eventId)) {
      const entities = [...new Map(
        evidenceDocuments.flatMap((documentId) => documentEntities.get(documentId) ?? [])
          .map((row) => [String(row.entity_id), row]),
      ).values()].slice(0, 8);
      inferredEntityRows.push(...entities.map((row) => ({
        owner_id: ownerId,
        event_id: eventId,
        entity_id: row.entity_id,
        role: row.role || "involved",
        source: "rule",
        confidence: Math.min(0.9, Number(row.confidence ?? 0.65) * 0.9),
        evidence_text: row.evidence_text ?? null,
        extraction_version: "event-evidence-link-v2.0.0",
        metadata: { inferred_from_evidence_document: true },
      })));
    }
  }
  for (let index = 0; index < inferredConceptRows.length; index += 500) {
    const write = await admin.from("intelligence_event_concepts").upsert(
      inferredConceptRows.slice(index, index + 500),
      { onConflict: "owner_id,association_key", ignoreDuplicates: true },
    );
    if (write.error) throw new Error(write.error.message);
  }
  for (let index = 0; index < inferredEntityRows.length; index += 500) {
    const write = await admin.from("intelligence_event_entities").upsert(
      inferredEntityRows.slice(index, index + 500),
      { onConflict: "event_id,entity_id,role", ignoreDuplicates: true },
    );
    if (write.error) throw new Error(write.error.message);
  }
  eventConceptRows.push(...inferredConceptRows);
  eventEntityRowsAll.push(...inferredEntityRows);
  const entityType = new Map(entityRows.map((row) => [String(row.id), String(row.entity_type)]));
  const provenanceEntitiesByEvent = new Map<
    string,
    Array<{ id: string; type: string; role: string }>
  >();
  for (const event of eventRows) {
    const eventId = String(event.id);
    const evidenceDocumentIds = cohortAlignedEvidenceDocumentIds({
      eventId,
      cohortByEvent,
      evidenceByEvent,
      documentCohorts,
    });
    const values = [...new Map(
      evidenceDocumentIds.flatMap((documentId) => documentEntities.get(documentId) ?? [])
        .map((row) => [
          `${row.entity_id}|${row.role}`,
          {
            id: String(row.entity_id),
            type: entityType.get(String(row.entity_id)) ?? "",
            role: String(row.role),
          },
        ] as const),
    ).values()];
    provenanceEntitiesByEvent.set(eventId, values);
  }
  const principal = (eventId: string) =>
    principalEntity(provenanceEntitiesByEvent.get(eventId) ?? []);
  const genericIds = eventRows.filter((event) =>
    /\b(?:daily|weekly) (?:brief|roundup)|\bnews digest\b|\btop stories\b/iu.test(String(event.title))
  ).map((event) => String(event.id));
  const futureIds = eventRows.filter((event) => {
    const announced = String(event.announced_at ?? "").slice(0, 10);
    const occurred = String(event.occurred_at ?? "").slice(0, 10);
    return announced > completeThrough || occurred > completeThrough;
  }).map((event) => String(event.id));
  const invalidProcurementIds = eventRows.filter((event) =>
    event.event_type === "procurement_notice" && !principal(String(event.id))
  ).map((event) => String(event.id));
  const rejectedIds = [...new Set([...genericIds, ...futureIds, ...invalidProcurementIds])];
  if (rejectedIds.length) {
    const exclude = await admin.from("intelligence_events").update({ review_status: "rejected" })
      .eq("owner_id", ownerId).in("id", rejectedIds);
    if (exclude.error) throw new Error(exclude.error.message);
  }
  const events = eventRows.filter((event) => {
    const date = eventDay(event);
    const announced = String(event.announced_at ?? "").slice(0, 10);
    const occurred = String(event.occurred_at ?? "").slice(0, 10);
    if (
      !date || announced > completeThrough || occurred > completeThrough ||
      Number(event.confidence ?? 0) < 0.6 || genericIds.includes(String(event.id))
    ) return false;
    if (event.event_type === "procurement_notice" && !principal(String(event.id))) return false;
    return true;
  });
  const groups = groupEventCandidates({ events, cohortByEvent, principal });
  let duplicateEventsCollapsed = 0;
  for (const group of groups) {
    // Existing ingestion already creates one event cluster per event. Only
    // write when two or more extracted events resolve to the same story.
    if (group.length < 2) continue;
    const canonical = [...group].sort((a, b) =>
      (evidenceByEvent.get(String(b.id))?.length ?? 0) -
        (evidenceByEvent.get(String(a.id))?.length ?? 0) ||
      Number(b.confidence ?? 0) - Number(a.confidence ?? 0)
    )[0];
    const canonicalId = String(canonical.id);
    const cohort = cohortByEvent.get(canonicalId) ?? "non_measurement";
    const fingerprint = sha256Hex(`event|${cohort}|${String(canonical.event_type)}|${principal(canonicalId) ?? normalizedWords(canonical.title).join(" ")}|${eventDay(canonical)}`);
    const cluster = await admin.from("intelligence_clusters").upsert({
      owner_id: ownerId,
      cluster_type: "event",
      fingerprint,
      title: canonical.title,
      metadata: {
        member_count: group.length,
        dedupe_version: "event-dedup-v2.0.0",
        dedup_cohort: cohort,
        measurement_eligible: cohort === "measurement",
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "owner_id,cluster_type,fingerprint" }).select("id").single();
    if (cluster.error || !cluster.data?.id) throw new Error(cluster.error?.message ?? "Failed to create event cluster.");
    const clusterId = String(cluster.data.id);
    const updateCanonical = await admin.from("intelligence_events")
      .update({ cluster_id: clusterId, updated_at: new Date().toISOString() })
      .eq("owner_id", ownerId).eq("id", canonicalId);
    if (updateCanonical.error) throw new Error(updateCanonical.error.message);
    const duplicates = group.filter((event) => String(event.id) !== canonicalId);
    const duplicateIds = duplicates.map((event) => String(event.id));
    const evidenceRows: DbRow[] = [...new Map<string, DbRow>(
      group.flatMap((event) => evidenceByEvent.get(String(event.id)) ?? [])
        .map((row: DbRow): DbRow => ({ ...row, event_id: canonicalId }))
        .map((row): [string, DbRow] => [String(row.document_id), row]),
    ).values()];
    if (evidenceRows.length) {
      const writeEvidence = await admin.from("intelligence_event_evidence").upsert(evidenceRows, {
        onConflict: "event_id,document_id",
      });
      if (writeEvidence.error) throw new Error(writeEvidence.error.message);
      const memberships = evidenceRows.map((row: DbRow) => ({
        owner_id: ownerId,
        cluster_id: clusterId,
        document_id: row.document_id,
        relationship: "supporting",
      }));
      const writeMemberships = await admin.from("intelligence_cluster_documents").upsert(memberships, {
        onConflict: "cluster_id,document_id",
      });
      if (writeMemberships.error) throw new Error(writeMemberships.error.message);
    }
    if (duplicateIds.length) {
      const conceptRows = [...new Map(
        eventConceptRows.filter((row) => duplicateIds.includes(String(row.event_id)))
        .map((row) => ({
          ...row,
          id: undefined,
          event_id: canonicalId,
          association_key: sha256Hex(`${canonicalId}|${row.concept_id}|${row.relation}|${row.source}`),
        }))
        .map((row) => [String(row.association_key), row]),
      ).values()];
      if (conceptRows.length) {
        const write = await admin.from("intelligence_event_concepts").upsert(conceptRows, {
          onConflict: "owner_id,association_key",
        });
        if (write.error) throw new Error(write.error.message);
      }
      const entityRows = [...new Map<string, DbRow>(
        eventEntityRowsAll.filter((row) => duplicateIds.includes(String(row.event_id)))
        .map((row): DbRow => ({ ...row, event_id: canonicalId }))
        .map((row): [string, DbRow] => [`${row.entity_id}|${row.role}`, row]),
      ).values()];
      if (entityRows.length) {
        const write = await admin.from("intelligence_event_entities").upsert(entityRows, {
          onConflict: "event_id,entity_id,role",
          ignoreDuplicates: true,
        });
        if (write.error) throw new Error(write.error.message);
      }
      const collapse = await admin.from("intelligence_events").update({
        cluster_id: clusterId,
        review_status: "rejected",
        updated_at: new Date().toISOString(),
      }).eq("owner_id", ownerId).in("id", duplicateIds);
      if (collapse.error) throw new Error(collapse.error.message);
      duplicateEventsCollapsed += duplicateIds.length;
    }
  }
  const linkedEventIds = new Set([
    ...eventConceptRows.map((row) => String(row.event_id)),
    ...eventEntityRowsAll.map((row) => String(row.event_id)),
  ]);
  return {
    eventClusters: groups.length,
    duplicateEventsRemoved: 0,
    duplicateEventsCollapsed,
    usableEvents: events.length,
    linkedUsableEvents: events.filter((event) => linkedEventIds.has(String(event.id))).length,
    inferredConceptLinks: inferredConceptRows.length,
    inferredEntityLinks: inferredEntityRows.length,
    genericEventsExcluded: genericIds.length,
    futureEventsExcluded: futureIds.length,
    invalidProcurementsExcluded: invalidProcurementIds.length,
  };
}

export async function rebuildStoryAndEventClustersV2(
  admin: SupabaseClient,
  ownerId: string,
  options: { completeThrough?: string } = {},
) {
  const completeThrough = options.completeThrough ?? new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
  const documentCohorts = await loadDocumentCohorts(admin, ownerId);
  const stories = await rebuildStoryClusters(admin, ownerId, documentCohorts);
  const events = await rebuildEventClusters(admin, ownerId, completeThrough, documentCohorts);
  return { ...stories, ...events, completeThrough };
}

export const __testables = {
  cohortAlignedEvidenceDocumentIds,
  daysApart,
  groupEventCandidates,
  groupStoryCandidates,
  normalizedWords,
  principalEntity,
  storyExactKey,
};
