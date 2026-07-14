import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "@/lib/ingestion/hash";
import { INTELLIGENCE_EMBEDDING_MODEL } from "@/lib/intelligence/enrichment";
import {
  directEventPrincipals,
  isQualifyingIntelligenceAction,
  principalEntities,
  principalEntity,
  qualifyingActionExclusion,
  type EventPrincipal,
  type EventPrincipalStrength,
} from "@/lib/intelligence/event-action-qualification";
import {
  isExactContentIdentityUrl,
  normalizeSourceUrl,
} from "@/lib/intelligence/source-url";
import {
  isMeasurementDocument,
  sourceIdFromDocument,
} from "@/lib/intelligence/source-cohort";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import {
  requireSignalRefreshLease,
  type SignalRefreshLeaseHolderKind,
} from "@/lib/intelligence/signal-refresh-lease";
import {
  INTELLIGENCE_EVENT_DEDUP_VERSION,
} from "@/lib/intelligence/event-cluster-memberships";
import {
  INTELLIGENCE_STORY_DEDUP_VERSION,
  INTELLIGENCE_STORY_REVIEW_VERSION,
} from "@/lib/intelligence/story-cluster-generations";

type DbRow = Record<string, unknown>;
type DedupCohort = "measurement" | "non_measurement";
const DAY_MS = 86_400_000;
const EVENT_WRITE_CHUNK_SIZE = 500;

export type IntelligenceDedupLeaseContext = {
  leaseToken: string;
  holderRunId: string;
  holderKind: SignalRefreshLeaseHolderKind;
};

async function runInConcurrentBatches<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const batchSize = Math.max(1, Math.floor(concurrency));
  const results: R[] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    const batch = values.slice(index, index + batchSize);
    const settled = await Promise.allSettled(
      batch.map((value, offset) => worker(value, index + offset)),
    );
    for (const result of settled) {
      if (result.status === "rejected") {
        if (result.reason instanceof Error) throw result.reason;
        throw new Error(String(result.reason));
      }
    }
    for (const result of settled) {
      if (result.status === "fulfilled") results.push(result.value);
    }
  }
  return results;
}

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize = 1_000,
) {
  const rows: T[] = [];
  const boundedPageSize = Math.min(1_000, Math.max(25, Math.floor(pageSize)));
  for (let from = 0; ; from += boundedPageSize) {
    const result = await query(from, from + boundedPageSize - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < boundedPageSize) return rows;
  }
}

async function loadDocumentCohorts(admin: SupabaseClient, ownerId: string) {
  const [documents, identities, sources] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin.from("documents")
      .select("id,published_at,created_at,source_identity_id,metadata")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_source_identities")
      .select("id,source_id").eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_sources")
      .select("id,status,cohort,measurement_active_from")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
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
  const words = String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-CA")
    .match(/[\p{L}\p{N}]+(?:[-./][\p{L}\p{N}]+)*/gu) ?? [];
  return words
    .filter((word) =>
      (word.length >= 3 || /\d/u.test(word)) &&
      !["the", "and", "for", "with", "from", "into", "new"].includes(word)
    )
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

function titleOverlap(
  a: unknown,
  b: unknown,
  ignoredDistinctiveWords: ReadonlySet<string> = new Set(),
) {
  const left = new Set(normalizedWords(a));
  const right = new Set(normalizedWords(b));
  const sharedWords = [...left].filter((word) => right.has(word));
  const overlap = sharedWords.length;
  const genericEventWords = new Set([
    "announce", "award", "canada", "company", "contract", "deal", "defence",
    "deploy", "development", "financing", "funding", "government", "investment",
    "launch", "launches", "million", "billion", "programme", "program", "raised",
    "raises", "round", "rounds", "security", "seed", "series", "system", "technology",
    "trial",
  ]);
  return {
    overlap,
    distinctiveOverlap: sharedWords.filter((word) => !genericEventWords.has(word)).length,
    actionDistinctiveOverlap: sharedWords.filter((word) =>
      !genericEventWords.has(word) && !ignoredDistinctiveWords.has(word)
    ).length,
    similarity: left.size && right.size
      ? overlap / (left.size + right.size - overlap)
      : 0,
    containment: left.size && right.size
      ? overlap / Math.min(left.size, right.size)
      : 0,
  };
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
  if (url && isExactContentIdentityUrl(url)) keys.push(`url:${url}`);
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
  const exactSet = new DisjointSet();
  const reviewCandidates: StoryReviewCandidate[] = [];
  const exactOwner = new Map<string, string>();
  for (const segment of input.segments) {
    const id = String(segment.id);
    const cohort = dedupCohort(segment);
    exactSet.add(id);
    for (const exact of storyExactKeys(segment)) {
      const cohortExact = `${cohort}|${exact}`;
      if (exactOwner.has(cohortExact)) exactSet.union(id, exactOwner.get(cohortExact)!);
      else exactOwner.set(cohortExact, id);
    }
  }
  const automaticPairs = new Set<string>();
  const pairKey = (left: unknown, right: unknown) =>
    [String(left), String(right)].sort().join("|");
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
      // A newsletter can contain several unrelated articles while inheriting
      // the same document-level entities and event types. Only exact URL/hash
      // identity (handled above) may merge two segments from one document.
      if (String(leftSegment.document_id) === String(rightSegment.document_id)) continue;
      const leftPrincipals = input.principalsByDocument.get(String(leftSegment.document_id)) ?? new Set<string>();
      const rightPrincipals = input.principalsByDocument.get(String(rightSegment.document_id)) ?? new Set<string>();
      const sharesPrincipal = [...leftPrincipals].some((id) => rightPrincipals.has(id));
      const leftEventTypes = input.eventTypesByDocument.get(String(leftSegment.document_id)) ?? new Set<string>();
      const rightEventTypes = input.eventTypesByDocument.get(String(rightSegment.document_id)) ?? new Set<string>();
      const hasCompatibleEvent = [...leftEventTypes].some((eventType) => rightEventTypes.has(eventType));
      const titleScore = titleSimilarity(leftSegment.story_title, rightSegment.story_title);
      if (titleScore < 0.5) continue;
      const leftVector = input.vectors.get(String(leftSegment.id)) ?? [];
      const rightVector = input.vectors.get(String(rightSegment.id)) ?? [];
      const embeddingScore = cosineSimilarity(leftVector, rightVector);
      const automaticThreshold = sharesPrincipal && hasCompatibleEvent ? 0.82 : 0.86;
      if (embeddingScore >= automaticThreshold) {
        automaticPairs.add(pairKey(leftSegment.id, rightSegment.id));
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
  const exactGroups = groupsFromSet(input.segments, exactSet).sort((a, b) =>
    String(a[0]?.published_at ?? "").localeCompare(String(b[0]?.published_at ?? "")) ||
    String(a[0]?.id ?? "").localeCompare(String(b[0]?.id ?? ""))
  );
  const groups: DbRow[][] = [];
  for (const exactGroup of exactGroups) {
    // Exact URL/hash components are trusted identity units. A semantic unit may
    // join an existing cluster only when every cross-pair passes the automatic
    // title/embedding rule, preventing a bridge story from chaining unrelated
    // announcements into one cluster.
    const target = groups.find((candidate) => exactGroup.every((left) =>
      candidate.every((right) => automaticPairs.has(pairKey(left.id, right.id)))
    ));
    if (target) target.push(...exactGroup);
    else groups.push([...exactGroup]);
  }
  const groupIndexBySegment = new Map<string, number>();
  groups.forEach((group, index) => {
    for (const segment of group) groupIndexBySegment.set(String(segment.id), index);
  });
  return {
    groups,
    reviewCandidates: reviewCandidates.filter((candidate) =>
      groupIndexBySegment.get(String(candidate.left.id)) !==
        groupIndexBySegment.get(String(candidate.right.id))
    ),
  };
}

async function rebuildStoryClusters(
  admin: SupabaseClient,
  ownerId: string,
  documentCohorts: Map<string, DedupCohort>,
  lease: IntelligenceDedupLeaseContext,
  renewLease: () => Promise<unknown>,
) {
  const generationId = randomUUID();
  const [segmentRows, embeddingRows, documentEntityRows, entityRows,
    eventEvidenceRows, eventRows] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_segments")
      .select("id,document_id,title,outbound_url,content_hash,confidence,documents!inner(title,published_at)")
      .eq("owner_id", ownerId).in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null).order("id", { ascending: true }).range(from, to)),
    // A thousand 1,536-dimension vectors exceeds the production PostgREST
    // statement/response budget. Keep this read deliberately small and only
    // load the vector space used by search and topic analysis.
    fetchPages<DbRow>((from, to) => admin.from("intelligence_segment_embeddings")
      .select("id,segment_id,embedding")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .order("segment_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to), 100),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_entities")
      .select("document_id,entity_id,role,confidence").eq("owner_id", ownerId)
      .gte("confidence", 0.65)
      .order("document_id", { ascending: true })
      .order("entity_id", { ascending: true })
      .order("role", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_entities")
      .select("id,entity_type").eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_evidence")
      .select("event_id,document_id").eq("owner_id", ownerId)
      .order("event_id", { ascending: true })
      .order("document_id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,event_type,review_status").eq("owner_id", ownerId)
      .neq("event_type", "other").neq("review_status", "rejected")
      .order("id", { ascending: true })
      .range(from, to)),
  ]);
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
  await renewLease();
  const generation = await admin.from("intelligence_story_dedup_generations").insert({
    generation_id: generationId,
    owner_id: ownerId,
    dedupe_version: INTELLIGENCE_STORY_DEDUP_VERSION,
    holder_run_id: lease.holderRunId,
    expected_story_cluster_count: groups.length,
    expected_segment_membership_count: groups.reduce(
      (count, group) => count + group.length,
      0,
    ),
    expected_document_membership_count: groups.reduce(
      (count, group) => count + new Set(group.map((row) => String(row.document_id))).size,
      0,
    ),
    expected_review_cluster_count: reviewCandidates.length,
    expected_review_membership_count: reviewCandidates.length * 2,
    status: "staging",
  });
  if (generation.error) {
    throw new Error(`Story dedup generation staging failed: ${generation.error.message}`);
  }
  const clusterRows = groups.map((group) => {
    const canonical = [...group].sort((a, b) =>
      Number(b.confidence ?? 0) - Number(a.confidence ?? 0) ||
      String(a.published_at).localeCompare(String(b.published_at))
    )[0];
    const cohort = dedupCohort(canonical);
    const fingerprint = sha256Hex(
      `story|${generationId}|${cohort}|${group.map((row) => String(row.id)).sort().join("|")}`,
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
        dedupe_version: INTELLIGENCE_STORY_DEDUP_VERSION,
        story_generation_id: generationId,
        dedup_cohort: cohort,
        measurement_eligible: cohort === "measurement",
      },
      updated_at: new Date().toISOString(),
      group,
    };
  });
  const clusterByFingerprint = new Map<string, string>();
  for (let index = 0; index < clusterRows.length; index += 500) {
    await renewLease();
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
    await renewLease();
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
    await renewLease();
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
      fingerprint: sha256Hex(`story-review|${generationId}|${segmentIds.join("|")}`),
      title: candidate.left.story_title,
      metadata: {
        member_count: 2,
        segment_ids: segmentIds,
        title_similarity: candidate.titleScore,
        embedding_similarity: candidate.embeddingScore,
        dedupe_version: INTELLIGENCE_STORY_REVIEW_VERSION,
        story_generation_id: generationId,
        dedup_cohort: dedupCohort(candidate.left),
        measurement_eligible: dedupCohort(candidate.left) === "measurement",
      },
      updated_at: new Date().toISOString(),
      candidate,
    };
  });
  const reviewClusterByFingerprint = new Map<string, string>();
  for (let index = 0; index < reviewClusterRows.length; index += 500) {
    await renewLease();
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
    await renewLease();
    const write = await admin.from("intelligence_cluster_segments").upsert(
      reviewSegmentRows.slice(index, index + 500),
      { onConflict: "cluster_id,segment_id" },
    );
    if (write.error) throw new Error(write.error.message);
  }
  // A staged generation is deliberately unreadable. The database validates
  // every expected row and switches the active generation in one transaction
  // while re-checking the same owner-wide lease.
  await renewLease();
  const activation = await admin.rpc("activate_intelligence_story_dedup_generation", {
    query_owner: ownerId,
    query_dedupe_version: INTELLIGENCE_STORY_DEDUP_VERSION,
    query_generation_id: generationId,
    query_lease_token: lease.leaseToken,
  });
  if (activation.error) {
    throw new Error(`Story dedup generation activation failed: ${activation.error.message}`);
  }
  const activationResult = (
    Array.isArray(activation.data) ? activation.data[0] : activation.data
  ) as Record<string, unknown> | null;
  if (activationResult?.activated !== true) {
    throw new Error("The staged story dedup generation was not activated.");
  }

  // Retired generations stay immutable and readable by generation ID. A
  // signal refresh that was interrupted before this activation can therefore
  // resume against exactly the story set it originally pinned. Retention is a
  // separate maintenance concern and must account for unfinished refreshes.
  return {
    storyClusters: clusterRows.length,
    storySegmentMemberships: segmentMembershipRows.length,
    storyDocumentMemberships: documentRows.length,
    storyReviewCandidates: reviewClusterRows.length,
    storyMembershipGeneration: generationId,
  };
}

function sharedPrincipalContext(
  left: EventPrincipal[],
  right: EventPrincipal[],
) {
  const rightById = new Map(right.map((principal) => [principal.id, principal]));
  const rank: Record<EventPrincipalStrength, number> = {
    strong: 3,
    capability: 2,
    organization: 1,
  };
  const shared = left
    .flatMap((principal) => {
      const other = rightById.get(principal.id);
      if (!other) return [];
      const strength = rank[principal.strength] <= rank[other.strength]
        ? principal.strength
        : other.strength;
      return [{
        strength,
        label: principal.label ?? other.label ?? "",
      }];
    })
    .sort((a, b) => rank[b.strength] - rank[a.strength]);
  return {
    strength: shared[0]?.strength ?? null,
    labelWords: new Set(shared.flatMap((principal) => normalizedWords(principal.label))),
  };
}

type ExactEvidenceIdentities = ReadonlyMap<string, ReadonlySet<string>>;

function hasIndependentExactEvidence(
  left: ExactEvidenceIdentities,
  right: ExactEvidenceIdentities,
) {
  for (const [identity, leftDocuments] of left) {
    const rightDocuments = right.get(identity);
    if (!rightDocuments) continue;
    for (const leftDocument of leftDocuments) {
      for (const rightDocument of rightDocuments) {
        if (leftDocument !== rightDocument) return true;
      }
    }
  }
  return false;
}

function eventModelIdentifiers(value: unknown) {
  return new Set(
    (String(value ?? "").normalize("NFKC").match(
      /\b(?=[\p{L}\p{N}./-]*\d)(?=[\p{L}\p{N}./-]*\p{L})[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*\b/gu,
    ) ?? [])
      .map((token) => token.toLocaleLowerCase("en-CA"))
      .filter((token) => !/^\d+(?:\.\d+)?(?:k|m|mm|bn|b)$/u.test(token)),
  );
}

function hasConflictingModelIdentifiers(left: unknown, right: unknown) {
  const leftIdentifiers = eventModelIdentifiers(left);
  const rightIdentifiers = eventModelIdentifiers(right);
  return leftIdentifiers.size > 0 && rightIdentifiers.size > 0 &&
    ![...leftIdentifiers].some((identifier) => rightIdentifiers.has(identifier));
}

function hasDownstreamActionMarker(value: unknown) {
  return /\b(?:after|consequent(?:ly)?|following|in response to|to comply with)\b/iu
    .test(String(value ?? ""));
}

function eventPairMatches(input: {
  left: DbRow;
  right: DbRow;
  cohortByEvent: Map<string, DedupCohort>;
  principals: (eventId: string) => EventPrincipal[];
  exactEvidenceKeys: (eventId: string) => ExactEvidenceIdentities;
  evidenceDocumentIds: (eventId: string) => ReadonlySet<string>;
}) {
  if (input.left.event_type !== input.right.event_type) return false;
  const dateDistance = daysApart(eventDay(input.left), eventDay(input.right));
  if (dateDistance > 7) return false;
  const leftId = String(input.left.id);
  const rightId = String(input.right.id);
  const leftCohort = input.cohortByEvent.get(leftId) ?? "non_measurement";
  const rightCohort = input.cohortByEvent.get(rightId) ?? "non_measurement";
  if (leftCohort !== rightCohort) return false;
  if (hasConflictingModelIdentifiers(input.left.title, input.right.title)) return false;
  // A directive and a later implementation may be one news story, but they
  // are separate real-world actions. Keep the downstream transition separate
  // unless the titles are otherwise near-identical.
  if (
    hasDownstreamActionMarker(input.left.title) !==
      hasDownstreamActionMarker(input.right.title) &&
    titleSimilarity(input.left.title, input.right.title) < 0.65
  ) return false;

  // These keys are deliberately limited to event-level evidence text or an
  // atomic document/story that supports only one event. They are stronger
  // identity evidence than a model-assigned organization or topic.
  if (hasIndependentExactEvidence(
    input.exactEvidenceKeys(leftId),
    input.exactEvidenceKeys(rightId),
  )) return true;

  const sharedPrincipal = sharedPrincipalContext(
    input.principals(leftId),
    input.principals(rightId),
  );
  const overlap = titleOverlap(
    input.left.title,
    input.right.title,
    sharedPrincipal.labelWords,
  );
  const leftDocuments = input.evidenceDocumentIds(leftId);
  const rightDocuments = input.evidenceDocumentIds(rightId);
  const sharesEvidenceDocument = [...leftDocuments].some((id) => rightDocuments.has(id));
  // Multiple events extracted from one newsletter or roundup are separate by
  // default. Only near-identical titles may collapse within that same source.
  if (sharesEvidenceDocument && overlap.similarity < 0.8) return false;
  const sharedStrength = sharedPrincipal.strength;
  if (sharedStrength === "strong") {
    // A programme or named system is precise enough to tolerate paraphrasing,
    // but it still needs two corroborating non-generic title words. Shared
    // words such as "Canada", "award", and "contract" are not event identity.
    if (input.left.event_type === "funding_investment") {
      return overlap.distinctiveOverlap >= 2 && overlap.similarity >= 0.65;
    }
    if (overlap.distinctiveOverlap < 2) return false;
    if (overlap.similarity >= 0.4) return true;
    // A shared product or programme name does not prove that two items
    // describe the same action. Mid-similarity items more than a day apart
    // must also share three meaningful words outside that principal label.
    // Near-identical short product announcements can still match on the same
    // or next day, preserving recall for concise newsletter titles.
    if (overlap.similarity >= 0.33) {
      return dateDistance <= 1 || overlap.actionDistinctiveOverlap >= 3;
    }
    return dateDistance <= 1 &&
      overlap.similarity >= 0.25 &&
      overlap.containment >= 0.4;
  }
  if (sharedStrength === "capability") {
    // Capability labels are often broad (for example, "AI" or "C-UAS").
    return overlap.similarity >= 0.7;
  }
  if (sharedStrength === "organization") {
    // The same company or agency can make many announcements in one week.
    return overlap.similarity >= 0.8;
  }
  return overlap.similarity >= 0.9;
}

function groupEventCandidates(input: {
  events: DbRow[];
  cohortByEvent: Map<string, DedupCohort>;
  principals: (eventId: string) => EventPrincipal[];
  exactEvidenceKeys?: (eventId: string) => ExactEvidenceIdentities;
  evidenceDocumentIds?: (eventId: string) => ReadonlySet<string>;
}) {
  const exactEvidenceKeys = input.exactEvidenceKeys ?? (() => new Map());
  const evidenceDocumentIds = input.evidenceDocumentIds ?? (() => new Set<string>());
  const groups: DbRow[][] = [];
  const events = [...input.events].sort((a, b) =>
    eventDay(a).localeCompare(eventDay(b)) ||
    String(a.event_type).localeCompare(String(b.event_type)) ||
    String(a.title).localeCompare(String(b.title)) ||
    String(a.id).localeCompare(String(b.id))
  );
  for (const event of events) {
    // Complete-link grouping prevents an ambiguous middle event from joining
    // two otherwise unrelated announcements through transitive single links.
    const group = groups.find((candidate) => candidate.every((member) =>
      eventPairMatches({
        left: event,
        right: member,
        cohortByEvent: input.cohortByEvent,
        principals: input.principals,
        exactEvidenceKeys,
        evidenceDocumentIds,
      })
    ));
    if (group) group.push(event);
    else groups.push([event]);
  }
  return groups;
}

type EventClusterPlan = {
  canonical: DbRow;
  canonicalId: string;
  cohort: DedupCohort;
  fingerprint: string;
  members: Array<{
    eventId: string;
    relationship: "canonical" | "member";
    matchMetadata: Record<string, unknown>;
  }>;
  memberCount: number;
};

function buildEventClusterPlans(input: {
  groups: DbRow[][];
  cohortByEvent: Map<string, DedupCohort>;
  principal: (eventId: string) => string | null;
  evidenceByEvent: Map<string, DbRow[]>;
}) {
  return input.groups.flatMap((group): EventClusterPlan[] => {
    // Singleton events already have stable ingestion identities. Analytical
    // memberships are only needed when several source event rows represent
    // one announcement.
    if (group.length < 2) return [];
    const reviewRank = (event: DbRow) =>
      event.review_status === "corrected" ? 3 :
        event.review_status === "confirmed" ? 2 : 1;
    const canonical = [...group].sort((a, b) =>
      reviewRank(b) - reviewRank(a) ||
      (input.evidenceByEvent.get(String(b.id))?.length ?? 0) -
        (input.evidenceByEvent.get(String(a.id))?.length ?? 0) ||
      Number(b.confidence ?? 0) - Number(a.confidence ?? 0) ||
      eventDay(a).localeCompare(eventDay(b)) ||
      String(a.id).localeCompare(String(b.id))
    )[0];
    const canonicalId = String(canonical.id);
    const cohort = input.cohortByEvent.get(canonicalId) ?? "non_measurement";
    const memberIdentity = group.map((event) =>
      `${String(event.id)}:${normalizedWords(event.title).join(" ")}`
    ).sort();
    return [{
      canonical,
      canonicalId,
      cohort,
      fingerprint: sha256Hex(
        `${INTELLIGENCE_EVENT_DEDUP_VERSION}|${cohort}|canonical:${canonicalId}|${memberIdentity.join("|")}`,
      ),
      members: group.map((event) => {
        const eventId = String(event.id);
        return {
          eventId,
          relationship: eventId === canonicalId ? "canonical" : "member",
          matchMetadata: {
            canonical_event_id: canonicalId,
            event_type: String(event.event_type),
            event_date: eventDay(event),
            canonical_date: eventDay(canonical),
            days_apart: daysApart(eventDay(event), eventDay(canonical)),
            title_similarity: titleSimilarity(event.title, canonical.title),
            principal_id: input.principal(eventId),
            canonical_principal_id: input.principal(canonicalId),
            ingestion_cluster_id: event.cluster_id ?? null,
          },
        };
      }),
      memberCount: group.length,
    }];
  });
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

function normalizedEvidenceText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-CA")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildExactEventEvidenceKeys(input: {
  events: DbRow[];
  evidenceByEvent: Map<string, DbRow[]>;
  documents: DbRow[];
}) {
  const activeEventIds = new Set(input.events.map((event) => String(event.id)));
  const eventIdsByDocument = new Map<string, Set<string>>();
  for (const [eventId, evidenceRows] of input.evidenceByEvent) {
    if (!activeEventIds.has(eventId)) continue;
    for (const row of evidenceRows) {
      const documentId = String(row.document_id);
      const values = eventIdsByDocument.get(documentId) ?? new Set<string>();
      values.add(eventId);
      eventIdsByDocument.set(documentId, values);
    }
  }
  const documentById = new Map(input.documents.map((row) => [String(row.id), row]));
  const keysByEvent = new Map<string, Map<string, Set<string>>>();
  for (const event of input.events) {
    const eventId = String(event.id);
    const keys = new Map<string, Set<string>>();
    const addKey = (identity: string, documentId: string) => {
      const documents = keys.get(identity) ?? new Set<string>();
      documents.add(documentId);
      keys.set(identity, documents);
    };
    for (const evidence of input.evidenceByEvent.get(eventId) ?? []) {
      const documentId = String(evidence.document_id);
      const evidenceText = normalizedEvidenceText(evidence.evidence_text);
      if (evidenceText.length >= 40 && normalizedWords(evidenceText).length >= 6) {
        addKey(`evidence:${sha256Hex(evidenceText)}`, documentId);
      }
      // A document URL, content hash, or story ID is exact event evidence only
      // when the document supports one active event. This excludes multi-story
      // newsletters and roundups from becoming false duplicate bridges.
      if ((eventIdsByDocument.get(documentId)?.size ?? 0) !== 1) continue;
      const document = documentById.get(documentId) ?? {};
      const url = normalizeSourceUrl(String(
        document.canonical_url ?? document.original_url ?? "",
      ));
      if (url && isExactContentIdentityUrl(url)) addKey(`url:${url}`, documentId);
      const contentHash = String(document.content_hash ?? "").trim();
      if (contentHash) addKey(`content:${contentHash}`, documentId);
    }
    keysByEvent.set(eventId, keys);
  }
  return keysByEvent;
}

async function rebuildEventClusters(
  admin: SupabaseClient,
  ownerId: string,
  completeThrough: string,
  documentCohorts: Map<string, DedupCohort>,
  lease: IntelligenceDedupLeaseContext,
  renewLease: () => Promise<unknown>,
) {
  const [eventRows, evidenceRowsInput, entityRows, conceptRowsInput,
    allEventEntityRows, documentConceptRows,
    documentEntityRows, evidenceDocumentRows] = await Promise.all([
    fetchPages<DbRow>((from, to) => admin.from("intelligence_events")
      .select("id,title,event_type,announced_at,occurred_at,confidence,cluster_id,review_status,metadata")
      .eq("owner_id", ownerId).neq("event_type", "other").neq("review_status", "rejected")
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_evidence").select("*")
      .eq("owner_id", ownerId)
      .order("event_id", { ascending: true })
      .order("document_id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_entities")
      .select("id,entity_type,canonical_name")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_concepts").select("*")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_event_entities").select("*")
      .eq("owner_id", ownerId)
      .order("event_id", { ascending: true })
      .order("entity_id", { ascending: true })
      .order("role", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_concepts")
      .select("id,document_id,concept_id,confidence,evidence_text")
      .eq("owner_id", ownerId).gte("confidence", 0.65)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_document_entities")
      .select("document_id,entity_id,role,confidence,evidence_text")
      .eq("owner_id", ownerId).gte("confidence", 0.65)
      .order("document_id", { ascending: true })
      .order("entity_id", { ascending: true })
      .order("role", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("documents")
      .select("id,canonical_url,original_url,content_hash")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
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
  const alignedEvidenceByEvent = new Map<string, DbRow[]>();
  const eventIdsByAlignedDocument = new Map<string, Set<string>>();
  for (const event of eventRows) {
    const eventId = String(event.id);
    const cohort = cohortByEvent.get(eventId) ?? "non_measurement";
    const aligned = (evidenceByEvent.get(eventId) ?? []).filter((row) =>
      (documentCohorts.get(String(row.document_id)) ?? "non_measurement") === cohort
    );
    alignedEvidenceByEvent.set(eventId, aligned);
    for (const row of aligned) {
      const documentId = String(row.document_id);
      const ids = eventIdsByAlignedDocument.get(documentId) ?? new Set<string>();
      ids.add(eventId);
      eventIdsByAlignedDocument.set(documentId, ids);
    }
  }
  const atomicEventDocumentIds = new Set(
    [...eventIdsByAlignedDocument]
      .filter(([, eventIds]) => eventIds.size === 1)
      .map(([documentId]) => documentId),
  );
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
  const entityLabel = new Map(
    entityRows.map((row) => [String(row.id), String(row.canonical_name ?? "")]),
  );
  const matchingPrincipalsByEvent = directEventPrincipals(eventEntityRowsAll, entityType);
  const documentEntitiesByEvent = new Map<
    string,
    Array<{ id: string; type: string; role: string }>
  >();
  for (const event of eventRows) {
    const eventId = String(event.id);
    const evidenceDocumentIds = (alignedEvidenceByEvent.get(eventId) ?? [])
      .map((row) => String(row.document_id))
      .filter((documentId) => atomicEventDocumentIds.has(documentId));
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
    documentEntitiesByEvent.set(eventId, values);
  }
  const matchingPrincipals = (eventId: string) =>
    (matchingPrincipalsByEvent.get(eventId) ?? []).map((principal) => ({
      ...principal,
      label: entityLabel.get(principal.id) ?? "",
    }));
  const matchingPrincipal = (eventId: string) => matchingPrincipals(eventId)[0]?.id ?? null;
  const procurementPrincipal = (eventId: string) =>
    matchingPrincipal(eventId) ??
    principalEntity(documentEntitiesByEvent.get(eventId) ?? []);
  const exclusionByEvent = new Map(eventRows.map((event) => [
    String(event.id),
    qualifyingActionExclusion({
      event,
      completeThrough,
      hasProcurementPrincipal: Boolean(procurementPrincipal(String(event.id))),
    }),
  ]));
  const genericIds = eventRows.filter((event) =>
    exclusionByEvent.get(String(event.id)) === "generic_summary"
  ).map((event) => String(event.id));
  const futureIds = eventRows.filter((event) =>
    exclusionByEvent.get(String(event.id)) === "future"
  ).map((event) => String(event.id));
  const invalidProcurementIds = eventRows.filter((event) =>
    exclusionByEvent.get(String(event.id)) === "invalid_procurement"
  ).map((event) => String(event.id));
  const events = eventRows.filter((event) => isQualifyingIntelligenceAction({
    event,
    completeThrough,
    hasProcurementPrincipal: Boolean(procurementPrincipal(String(event.id))),
  }));
  const exactEvidenceKeysByEvent = buildExactEventEvidenceKeys({
    events,
    evidenceByEvent: alignedEvidenceByEvent,
    documents: evidenceDocumentRows,
  });
  const groups = groupEventCandidates({
    events,
    cohortByEvent,
    principals: matchingPrincipals,
    exactEvidenceKeys: (eventId) => exactEvidenceKeysByEvent.get(eventId) ?? new Map(),
    evidenceDocumentIds: (eventId) => new Set(
      (alignedEvidenceByEvent.get(eventId) ?? []).map((row) => String(row.document_id)),
    ),
  });
  const clusterPlans = buildEventClusterPlans({
    groups,
    cohortByEvent,
    principal: matchingPrincipal,
    evidenceByEvent: alignedEvidenceByEvent,
  });
  const generationId = randomUUID();
  const updatedAt = new Date().toISOString();
  const expectedMembershipCount = clusterPlans.reduce(
    (count, plan) => count + plan.memberCount,
    0,
  );
  const stageGeneration = await admin.from("intelligence_event_dedup_generations").insert({
    generation_id: generationId,
    owner_id: ownerId,
    match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
    holder_run_id: lease.holderRunId,
    complete_through: completeThrough,
    expected_cluster_count: clusterPlans.length,
    expected_membership_count: expectedMembershipCount,
    status: "staging",
    updated_at: updatedAt,
  });
  if (stageGeneration.error) throw new Error(stageGeneration.error.message);
  const clusterIdByFingerprint = new Map<string, string>();
  for (let index = 0; index < clusterPlans.length; index += EVENT_WRITE_CHUNK_SIZE) {
    const write = await admin.from("intelligence_clusters").upsert(
      clusterPlans.slice(index, index + EVENT_WRITE_CHUNK_SIZE).map((plan) => ({
        owner_id: ownerId,
        cluster_type: "event",
        fingerprint: plan.fingerprint,
        title: plan.canonical.title,
        metadata: {
          member_count: plan.memberCount,
          dedupe_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
          dedup_cohort: plan.cohort,
          measurement_eligible: plan.cohort === "measurement",
          canonical_event_id: plan.canonicalId,
          reversible_membership: true,
        },
        updated_at: updatedAt,
      })),
      { onConflict: "owner_id,cluster_type,fingerprint" },
    ).select("id,fingerprint");
    if (write.error) throw new Error(write.error.message);
    for (const row of write.data ?? []) {
      clusterIdByFingerprint.set(String(row.fingerprint), String(row.id));
    }
    await renewLease();
  }
  for (const plan of clusterPlans) {
    if (!clusterIdByFingerprint.has(plan.fingerprint)) {
      throw new Error(`Failed to resolve event cluster ${plan.fingerprint}.`);
    }
  }
  const membershipRows = clusterPlans.flatMap((plan) => {
    const clusterId = clusterIdByFingerprint.get(plan.fingerprint)!;
    return plan.members.map((member) => ({
      owner_id: ownerId,
      generation_id: generationId,
      cluster_id: clusterId,
      event_id: member.eventId,
      relationship: member.relationship,
      match_metadata: {
        ...member.matchMetadata,
        fingerprint: plan.fingerprint,
        member_count: plan.memberCount,
      },
      match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
      updated_at: updatedAt,
    }));
  });
  for (let index = 0; index < membershipRows.length; index += EVENT_WRITE_CHUNK_SIZE) {
    const write = await admin.from("intelligence_event_cluster_memberships").upsert(
      membershipRows.slice(index, index + EVENT_WRITE_CHUNK_SIZE),
      { onConflict: "owner_id,generation_id,event_id" },
    );
    if (write.error) throw new Error(write.error.message);
    await renewLease();
  }
  // The activation RPC verifies the complete staged generation and changes the
  // one active pointer in its own transaction. Interrupted staging therefore
  // leaves the previous active generation readable and untouched.
  await renewLease();
  const activation = await admin.rpc("activate_intelligence_event_dedup_generation", {
    query_owner: ownerId,
    query_match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
    query_generation_id: generationId,
    query_lease_token: lease.leaseToken,
  });
  if (activation.error) throw new Error(activation.error.message);
  const activationResult = activation.data && typeof activation.data === "object"
    ? activation.data as Record<string, unknown>
    : {};
  if (activationResult.activated !== true) {
    throw new Error("The staged event membership generation was not activated.");
  }
  const duplicateEventsGrouped = clusterPlans.reduce(
    (count, plan) => count + plan.memberCount - 1,
    0,
  );
  const linkedEventIds = new Set([
    ...eventConceptRows.map((row) => String(row.event_id)),
    ...eventEntityRowsAll.map((row) => String(row.event_id)),
  ]);
  return {
    eventGroups: groups.length,
    eventClusters: clusterPlans.length,
    eventMemberships: membershipRows.length,
    eventMembershipGeneration: generationId,
    duplicateEventsRemoved: 0,
    duplicateEventsCollapsed: 0,
    duplicateEventsGrouped,
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
  options: {
    completeThrough?: string;
    lease: IntelligenceDedupLeaseContext;
  },
) {
  const completeThrough = options.completeThrough ?? latestCompleteDateKey();
  const renewLease = () => requireSignalRefreshLease(admin, {
    ownerId,
    leaseToken: options.lease.leaseToken,
    holderRunId: options.lease.holderRunId,
    holderKind: options.lease.holderKind,
    ttlSeconds: 1_800,
  });
  await renewLease();
  const documentCohorts = await loadDocumentCohorts(admin, ownerId);
  const stories = await rebuildStoryClusters(
    admin,
    ownerId,
    documentCohorts,
    options.lease,
    renewLease,
  );
  await renewLease();
  const events = await rebuildEventClusters(
    admin,
    ownerId,
    completeThrough,
    documentCohorts,
    options.lease,
    renewLease,
  );
  return { ...stories, ...events, completeThrough };
}

export const __testables = {
  buildExactEventEvidenceKeys,
  buildEventClusterPlans,
  cohortAlignedEvidenceDocumentIds,
  daysApart,
  directEventPrincipals,
  eventModelIdentifiers,
  eventPairMatches,
  groupEventCandidates,
  groupStoryCandidates,
  normalizedWords,
  principalEntities,
  principalEntity,
  runInConcurrentBatches,
  storyExactKey,
};
