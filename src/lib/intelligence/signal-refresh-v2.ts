import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  buildCanonicalSignalDailyRows,
  buildSignalDailyTotals,
  INTELLIGENCE_SIGNAL_METRIC_VERSION,
  retainGloballySupportedSignalObservations,
  summarizeCanonicalSignalHistory,
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
  isTrendEligibleNormalizedTerm,
  refreshTermObservationsBatch,
} from "@/lib/intelligence/term-observations";
import { refreshSegmentEmbeddingsBatch } from "@/lib/intelligence/hybrid-search-v2";
import {
  rebuildStoryAndEventClustersV2,
  type IntelligenceDedupLeaseContext,
} from "@/lib/intelligence/dedup-v2";
import {
  directEventPrincipals,
  isQualifyingIntelligenceAction,
  principalEntity,
} from "@/lib/intelligence/event-action-qualification";
import {
  analyticalActionKeyByEventId,
  INTELLIGENCE_EVENT_DEDUP_VERSION,
  loadActiveEventMembershipGeneration,
  loadEventMembershipGeneration,
  type ActiveEventMembershipGeneration,
} from "@/lib/intelligence/event-cluster-memberships";
import {
  isStoryClusterInGeneration,
  loadActiveStoryMembershipGeneration,
  loadStoryMembershipGeneration,
  type StoryMembershipGeneration,
} from "@/lib/intelligence/story-cluster-generations";
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
import { isRecurringNewsletterBoilerplate } from "@/lib/intelligence/newsletter-boilerplate";
import {
  DEFAULT_TERM_SIGNAL_BATCH_SIZE,
  TERM_SIGNAL_CLEANUP_CURSOR_BASE,
  TERM_SIGNAL_FINALIZE_CURSOR_BASE,
  TERM_SIGNAL_TERM_CURSOR_BASE,
  accumulateTermSignalSupport,
  decodeTermSignalCleanupCursor,
  fetchTermSignalBatch,
  finalizeTermSignalSupport,
} from "@/lib/intelligence/term-signal-refresh";
import {
  beginIntelligenceSignalGeneration,
  completeIntelligenceSignalGeneration,
} from "@/lib/intelligence/signal-generations-v2";

// PostgREST applies a short statement timeout in production. Signal rows are
// wider than term-support rows, and 500-row upserts can exceed that timeout as
// the archive grows. Keep writes bounded so a resumable refresh makes steady
// progress under normal concurrent load.
const SIGNAL_DAILY_WRITE_BATCH_SIZE = 200;

// Keep every context read below the production PostgREST timeout. The largest
// archive tables have wide JSON/text rows, so even indexed, deterministically
// ordered 1,000-row pages can exceed the request budget.
const PAGE_SIZE = 250;
const DAY_MS = 86_400_000;

type DbRow = Record<string, unknown>;
type SignalRefreshContextRows = [
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
  DbRow[],
];

// A local validation or scheduled request scores many bounded term pages for
// one immutable refresh snapshot. Keep its static measurement context in the
// current Node process instead of downloading the archive again for every
// page. Failed scoring pages retain the cache for their in-process retry.
// Ordinary contexts are released on the final term page; the local validation
// runner explicitly releases its shared clone context before a current-window
// run so the two windows can never share data or occupy memory together.
const signalRefreshContextCache = new Map<
  string,
  Promise<SignalRefreshContextRows>
>();

type SignalRefreshContextPlanInput = {
  ownerId: string;
  refreshId: string;
  sharedValidationContextSourceId?: string;
  startDate: string;
  completeThrough: string;
  eventDedupGenerationId?: string | null;
  storyDedupGenerationId?: string | null;
  firstTermBatch: boolean;
};

function signalRefreshContextPlan(input: SignalRefreshContextPlanInput) {
  const sharedSourceId = input.sharedValidationContextSourceId?.trim() || null;
  const namespace = sharedSourceId ? "validation" : "refresh";
  const contextIdentity = sharedSourceId ?? input.refreshId;
  return {
    cacheKey: [
      namespace,
      input.ownerId,
      contextIdentity,
      input.startDate,
      input.completeThrough,
      INTELLIGENCE_SIGNAL_METRIC_VERSION,
      INTELLIGENCE_TERM_EXTRACTION_VERSION,
      input.eventDedupGenerationId ?? "no-event-generation",
      input.storyDedupGenerationId ?? "no-story-generation",
    ].join(":"),
    includeSignalCatalog: input.firstTermBatch || Boolean(sharedSourceId),
    retainAcrossRefreshes: Boolean(sharedSourceId),
  };
}

function shouldReleaseSignalRefreshContext(input: {
  termBatchHasMore: boolean;
  retainAcrossRefreshes: boolean;
}) {
  return !input.termBatchHasMore && !input.retainAcrossRefreshes;
}

export function releaseSharedSignalRefreshValidationContext(
  ownerId: string,
  sourceRefreshId: string,
) {
  const prefix = `validation:${ownerId}:${sourceRefreshId.trim()}:`;
  let released = 0;
  for (const key of signalRefreshContextCache.keys()) {
    if (!key.startsWith(prefix)) continue;
    signalRefreshContextCache.delete(key);
    released += 1;
  }
  return released;
}

function addDays(value: string, days: number) {
  return new Date(new Date(`${value}T12:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

async function completeCanonicalSignalGeneration(
  admin: SupabaseClient,
  input: {
    ownerId: string;
    refreshId: string;
    refreshStartedAt: string;
    startDate: string;
    completeThrough: string;
    finalOrdinal: number;
    promote: boolean;
    eventDedupGenerationId?: string | null;
    storyDedupGenerationId?: string | null;
  },
) {
  const generation = await completeIntelligenceSignalGeneration(admin, {
    ownerId: input.ownerId,
    refreshId: input.refreshId,
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    startDate: input.startDate,
    completeThrough: input.completeThrough,
    generationStartedAt: input.refreshStartedAt,
    finalOrdinal: input.finalOrdinal,
    promote: input.promote,
    eventDedupGenerationId: input.eventDedupGenerationId,
    storyDedupGenerationId: input.storyDedupGenerationId,
  });
  return {
    removedCount: 0,
    hasMore: false,
    signalCount: generation.signalCount,
    dailyRowCount: generation.dailyRowCount,
    generationStatus: generation.status,
  };
}

async function fetchPages<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize = PAGE_SIZE,
) {
  const rows: T[] = [];
  const boundedPageSize = Math.min(PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
  for (let from = 0; ; from += boundedPageSize) {
    const result = await query(from, from + boundedPageSize - 1);
    if (result.error) throw new Error(result.error.message);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < boundedPageSize) return rows;
  }
}

function object(value: unknown): DbRow {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as DbRow : {};
}

function completeSignalDailyTotals(
  dailyTotals: Array<{ date: string; items: number; tokens: number }>,
  storedRows: Array<{
    signal_date: string;
    eligible_items: number;
    eligible_tokens: number;
  }>,
) {
  const byDate = new Map(dailyTotals.map((row) => [row.date, { ...row }]));
  for (const row of storedRows) {
    const existing = byDate.get(row.signal_date);
    if (existing) {
      existing.items = Math.max(existing.items, row.eligible_items);
      existing.tokens = Math.max(existing.tokens, row.eligible_tokens);
      continue;
    }
    byDate.set(row.signal_date, {
      date: row.signal_date,
      items: Math.max(0, row.eligible_items),
      tokens: Math.max(0, row.eligible_tokens),
    });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
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

function isMeasurementStoryCluster(
  row: DbRow,
  generation: StoryMembershipGeneration | null = null,
) {
  const metadata = object(row.metadata);
  return metadata.measurement_eligible === true &&
    isStoryClusterInGeneration(row, generation);
}

type SignalDedupGenerationPins = {
  eventDedupGenerationId?: string | null;
  storyDedupGenerationId?: string | null;
};

async function resolveSignalDedupGenerations(
  admin: SupabaseClient,
  ownerId: string,
  pins: SignalDedupGenerationPins,
  options: { allowUnpinned: boolean },
) {
  if (!options.allowUnpinned && pins.eventDedupGenerationId === undefined) {
    throw new Error(
      "The resumable signal refresh is missing its pinned event-dedup generation; restart from cursor 0.",
    );
  }
  if (!options.allowUnpinned && pins.storyDedupGenerationId === undefined) {
    throw new Error(
      "The resumable signal refresh is missing its pinned story-dedup generation; restart from cursor 0.",
    );
  }
  const [eventGeneration, storyGeneration] = await Promise.all([
    pins.eventDedupGenerationId === undefined
      ? loadActiveEventMembershipGeneration(admin, ownerId)
      : pins.eventDedupGenerationId === null
        ? Promise.resolve(null)
        : loadEventMembershipGeneration(
            admin,
            ownerId,
            pins.eventDedupGenerationId,
          ),
    pins.storyDedupGenerationId === undefined
      ? loadActiveStoryMembershipGeneration(admin, ownerId)
      : pins.storyDedupGenerationId === null
        ? Promise.resolve(null)
        : loadStoryMembershipGeneration(
            admin,
            ownerId,
            pins.storyDedupGenerationId,
          ),
  ]);
  if (pins.eventDedupGenerationId && !eventGeneration) {
    throw new Error(
      `Pinned event-dedup generation ${pins.eventDedupGenerationId} is missing; restart the signal refresh from cursor 0.`,
    );
  }
  if (pins.storyDedupGenerationId && !storyGeneration) {
    throw new Error(
      `Pinned story-dedup generation ${pins.storyDedupGenerationId} is missing; restart the signal refresh from cursor 0.`,
    );
  }
  if (storyGeneration?.status === "staging") {
    throw new Error(
      `Pinned story-dedup generation ${storyGeneration.generationId} was never activated.`,
    );
  }
  const currentEventGeneration =
    eventGeneration?.matchVersion === INTELLIGENCE_EVENT_DEDUP_VERSION
      ? eventGeneration
      : null;
  if (eventGeneration && !currentEventGeneration) {
    throw new Error(
      `Pinned event-dedup generation ${eventGeneration.generationId} uses an unsupported match version.`,
    );
  }
  return {
    eventGeneration: currentEventGeneration satisfies ActiveEventMembershipGeneration | null,
    storyGeneration,
  };
}

function validSignalEvent(
  row: DbRow,
  completeThrough: string,
  hasProcurementPrincipal: boolean,
) {
  return isQualifyingIntelligenceAction({
    event: row,
    completeThrough,
    hasProcurementPrincipal,
  });
}

type RecurringSegmentCandidate = {
  id: string;
  documentId: string;
  contentHash: string;
  sourceFamily: string;
  title: string;
  contentText: string;
};

function recurringBoilerplateSegmentIds(candidates: RecurringSegmentCandidate[]) {
  const groups = new Map<string, {
    segmentIds: string[];
    documentIds: Set<string>;
    sourceFamilies: Set<string>;
    clearBoilerplate: boolean;
  }>();
  for (const candidate of candidates) {
    const contentHash = candidate.contentHash.trim();
    const sourceFamily = candidate.sourceFamily.trim().toLocaleLowerCase("en-CA");
    if (!contentHash || !sourceFamily) continue;
    const group = groups.get(contentHash) ?? {
      segmentIds: [],
      documentIds: new Set<string>(),
      sourceFamilies: new Set<string>(),
      clearBoilerplate: false,
    };
    group.segmentIds.push(candidate.id);
    group.documentIds.add(candidate.documentId);
    group.sourceFamilies.add(sourceFamily);
    group.clearBoilerplate ||= isRecurringNewsletterBoilerplate(
      candidate.title,
      candidate.contentText,
    );
    groups.set(contentHash, group);
  }

  return new Set([...groups.values()].flatMap((group) =>
    group.clearBoilerplate && group.documentIds.size >= 3 && group.sourceFamilies.size === 1
      ? group.segmentIds
      : []
  ));
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

function termSignalCursorState(
  cursorValue: unknown,
  existingFinalizedTermSupport = false,
) {
  const signalCursor = Math.max(0, Math.floor(Number(cursorValue) || 0));
  if (existingFinalizedTermSupport && signalCursor !== 0) {
    throw new Error(
      "Existing finalized term support can only enter a signal refresh at cursor 0.",
    );
  }
  const cleaningStaleGeneration = signalCursor >= TERM_SIGNAL_CLEANUP_CURSOR_BASE;
  const cleanupCursor = cleaningStaleGeneration
    ? decodeTermSignalCleanupCursor(signalCursor)
    : null;
  const buildingTermSupport = !existingFinalizedTermSupport &&
    !cleaningStaleGeneration && signalCursor < TERM_SIGNAL_TERM_CURSOR_BASE;
  const finalizingTermSupport = buildingTermSupport &&
    signalCursor >= TERM_SIGNAL_FINALIZE_CURSOR_BASE;
  const termCursor = buildingTermSupport || cleaningStaleGeneration
    ? 0
    : existingFinalizedTermSupport
      ? 0
      : signalCursor - TERM_SIGNAL_TERM_CURSOR_BASE;
  return {
    signalCursor,
    cleanupCursor,
    buildingTermSupport,
    finalizingTermSupport,
    termCursor,
    firstTermBatch: !buildingTermSupport && termCursor === 0,
  };
}

export async function refreshSignalsV2Batch(
  admin: SupabaseClient,
  ownerId: string,
  options: {
    completeThrough?: string;
    historyDays?: number;
    refreshId: string;
    refreshStartedAt: string;
    termCursor?: number;
    termLimit?: number;
    supportLimit?: number;
    existingFinalizedTermSupport?: boolean;
    sharedValidationContextSourceId?: string;
    promoteGeneration?: boolean;
    eventDedupGenerationId?: string | null;
    storyDedupGenerationId?: string | null;
  },
) {
  const completeThrough = options.completeThrough ?? latestCompleteDateKey();
  const historyDays = Math.min(730, Math.max(112, options.historyDays ?? 395));
  const startDate = addDays(completeThrough, -(historyDays - 1));
  const {
    signalCursor,
    cleanupCursor,
    buildingTermSupport,
    finalizingTermSupport,
    termCursor,
    firstTermBatch,
  } = termSignalCursorState(
    options.termCursor,
    options.existingFinalizedTermSupport === true,
  );

  const sharedValidationContextSourceId =
    options.sharedValidationContextSourceId?.trim();
  const promoteGeneration = options.promoteGeneration !== false;
  if (
    options.sharedValidationContextSourceId !== undefined &&
    !sharedValidationContextSourceId
  ) {
    throw new Error("Shared validation context source ID must not be empty.");
  }
  if (sharedValidationContextSourceId === options.refreshId) {
    throw new Error(
      "Shared validation context source and target refreshes must differ.",
    );
  }
  if (sharedValidationContextSourceId && buildingTermSupport) {
    throw new Error(
      "Shared validation context requires an already-finalized cloned support snapshot.",
    );
  }
  if (sharedValidationContextSourceId && promoteGeneration) {
    throw new Error(
      "A cloned validation refresh must not replace the active production generation.",
    );
  }

  const signalGeneration = await beginIntelligenceSignalGeneration(admin, {
    ownerId,
    refreshId: options.refreshId,
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    startDate,
    completeThrough,
    generationStartedAt: options.refreshStartedAt,
    promote: promoteGeneration,
  });
  if (signalGeneration.status === "retired" && promoteGeneration) {
    throw new Error(
      "This canonical signal generation was superseded and cannot be resumed.",
    );
  }
  if (signalGeneration.status !== "staging") {
    return {
      completeThrough: signalGeneration.completeThrough,
      startDate: signalGeneration.startDate,
      eligibleItemCount: 0,
      observationCount: 0,
      processedCandidateTermCount: 0,
      expectedTermObservationCount: 0,
      signalCount: signalGeneration.signalCount,
      dailyRowCount: signalGeneration.dailyRowCount,
      removedStaleRows: 0,
      hasMore: false,
      nextCursor: null,
      metricVersion: signalGeneration.metricVersion,
      refreshStartedAt: signalGeneration.generationStartedAt,
      signalStage: "terms" as const,
      eventDedupGenerationId: signalGeneration.eventDedupGenerationId,
      storyDedupGenerationId: signalGeneration.storyDedupGenerationId,
    };
  }

  if (cleanupCursor) {
    const generations = await resolveSignalDedupGenerations(
      admin,
      ownerId,
      options,
      { allowUnpinned: false },
    );
    const completion = await completeCanonicalSignalGeneration(admin, {
      ownerId,
      refreshId: options.refreshId,
      refreshStartedAt: options.refreshStartedAt,
      startDate,
      completeThrough,
      finalOrdinal: cleanupCursor.finalOrdinal,
      promote: promoteGeneration,
      eventDedupGenerationId: generations.eventGeneration?.generationId ?? null,
      storyDedupGenerationId: generations.storyGeneration?.generationId ?? null,
    });
    return {
      completeThrough,
      startDate,
      eligibleItemCount: 0,
      observationCount: 0,
      processedCandidateTermCount: 0,
      expectedTermObservationCount: 0,
      signalCount: completion.signalCount ?? 0,
      dailyRowCount: completion.dailyRowCount ?? 0,
      removedStaleRows: completion.removedCount,
      hasMore: completion.hasMore,
      nextCursor: null,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      refreshStartedAt: options.refreshStartedAt,
      signalStage: "cleanup" as const,
      eventDedupGenerationId:
        generations.eventGeneration?.generationId ?? null,
      storyDedupGenerationId:
        generations.storyGeneration?.generationId ?? null,
    };
  }

  // Cursor zero captures the authoritative eligible-segment snapshot. Every
  // later support page advances that snapshot inside Postgres, so continuation
  // requests do not reload the archive or change membership mid-refresh.
  if (finalizingTermSupport) {
    const finalization = await finalizeTermSignalSupport(admin, {
      ownerId,
      refreshId: options.refreshId,
      extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      startDate,
      endDate: completeThrough,
    });
    return {
      completeThrough,
      startDate,
      eligibleItemCount: 0,
      observationCount: 0,
      processedCandidateTermCount: 0,
      processedSupportItemCount: 0,
      candidateTermCount: finalization.candidateTermCount,
      expectedTermObservationCount: 0,
      signalCount: 0,
      dailyRowCount: 0,
      removedStaleRows: 0,
      hasMore: true,
      nextCursor: finalization.hasMore
        ? signalCursor + 1
        : TERM_SIGNAL_TERM_CURSOR_BASE,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      refreshStartedAt: options.refreshStartedAt,
      signalStage: "support" as const,
      eventDedupGenerationId: options.eventDedupGenerationId,
      storyDedupGenerationId: options.storyDedupGenerationId,
    };
  }

  if (buildingTermSupport && signalCursor > 0) {
    const support = await accumulateTermSignalSupport(admin, {
      ownerId,
      refreshId: options.refreshId,
      extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      startDate,
      endDate: completeThrough,
      segmentIds: [],
      reset: false,
      batchSize: options.supportLimit,
    });
    if (!support.processedSegmentCount && support.remainingSegmentCount) {
      throw new Error("Term signal support did not advance its saved cursor.");
    }
    if (support.remainingSegmentCount) {
      return {
        completeThrough,
        startDate,
        eligibleItemCount: support.totalSegmentCount,
        observationCount: 0,
        processedCandidateTermCount: 0,
        processedSupportItemCount: support.processedSegmentCount,
        expectedTermObservationCount: 0,
        signalCount: 0,
        dailyRowCount: 0,
        removedStaleRows: 0,
        hasMore: true,
        nextCursor: signalCursor + support.processedSegmentCount,
        metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
        refreshStartedAt: options.refreshStartedAt,
        signalStage: "support" as const,
        eventDedupGenerationId: options.eventDedupGenerationId,
        storyDedupGenerationId: options.storyDedupGenerationId,
      };
    }
    const finalization = await finalizeTermSignalSupport(admin, {
      ownerId,
      refreshId: options.refreshId,
      extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      startDate,
      endDate: completeThrough,
    });
    return {
      completeThrough,
      startDate,
      eligibleItemCount: support.totalSegmentCount,
      observationCount: 0,
      processedCandidateTermCount: 0,
      processedSupportItemCount: support.processedSegmentCount,
      candidateTermCount: finalization.candidateTermCount,
      expectedTermObservationCount: 0,
      signalCount: 0,
      dailyRowCount: 0,
      removedStaleRows: 0,
      hasMore: true,
      nextCursor: finalization.hasMore
        ? TERM_SIGNAL_FINALIZE_CURSOR_BASE
        : TERM_SIGNAL_TERM_CURSOR_BASE,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      refreshStartedAt: options.refreshStartedAt,
      signalStage: "support" as const,
      eventDedupGenerationId: options.eventDedupGenerationId,
      storyDedupGenerationId: options.storyDedupGenerationId,
    };
  }

  const generations = buildingTermSupport
    ? { eventGeneration: null, storyGeneration: null }
    : await resolveSignalDedupGenerations(admin, ownerId, options, {
        allowUnpinned: termCursor === 0,
      });
  const currentEventGeneration = generations.eventGeneration;
  const currentStoryGeneration = generations.storyGeneration;
  const contextPlan = signalRefreshContextPlan({
    ownerId,
    refreshId: options.refreshId,
    sharedValidationContextSourceId,
    startDate,
    completeThrough,
    eventDedupGenerationId: currentEventGeneration?.generationId ?? null,
    storyDedupGenerationId: currentStoryGeneration?.generationId ?? null,
    firstTermBatch,
  });
  const loadContextRows = () => Promise.all([
    fetchPages<DbRow>((from, to) => admin
      .from("intelligence_document_segments")
      .select("id,document_id,title,content_text,content_hash,segment_type,token_count,confidence,metadata,exclusion_reason")
      .eq("owner_id", ownerId)
      .in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null)
      .order("id", { ascending: true })
      .range(from, to), 250),
    fetchPages<DbRow>((from, to) => admin.from("documents")
      .select("id,title,publisher_name,published_at,created_at,source_identity_id,metadata")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to), 100),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_source_identities")
      .select("id,source_id,source_family,normalized_family,authority_tier")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchPages<DbRow>((from, to) => admin.from("intelligence_sources")
      .select("id,status,cohort,measurement_active_from")
      .eq("owner_id", ownerId)
      .order("id", { ascending: true })
      .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin
        .from("intelligence_term_signal_refresh_segments")
        .select("segment_id")
        .eq("owner_id", ownerId)
        .eq("refresh_id", options.refreshId)
        .order("segment_id", { ascending: true })
        .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_cluster_segments")
        .select("segment_id,cluster_id")
        .eq("owner_id", ownerId)
        .order("cluster_id", { ascending: true })
        .order("segment_id", { ascending: true })
        .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_cluster_documents")
        .select("document_id,cluster_id")
        .eq("owner_id", ownerId)
        .order("cluster_id", { ascending: true })
        .order("document_id", { ascending: true })
        .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_clusters")
        .select("id,cluster_type,metadata")
        .eq("owner_id", ownerId).eq("cluster_type", "story")
        .order("id", { ascending: true })
        .range(from, to)),
    contextPlan.includeSignalCatalog
      ? fetchPages<DbRow>((from, to) => admin.from("intelligence_concepts")
        .select("id,concept_type,canonical_label,domain,status")
        .eq("owner_id", ownerId).in("status", ["active", "candidate"])
        .order("id", { ascending: true })
        .range(from, to))
      : Promise.resolve([] as DbRow[]),
    contextPlan.includeSignalCatalog
      ? fetchPages<DbRow>((from, to) => admin.from("intelligence_document_concepts")
        .select("id,document_id,segment_id,concept_id,mention_count,confidence,evidence_text")
        .eq("owner_id", ownerId).gte("confidence", 0.6)
        .order("id", { ascending: true })
        .range(from, to))
      : Promise.resolve([] as DbRow[]),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_entities")
        .select("id,entity_type,canonical_name,status")
        .eq("owner_id", ownerId).eq("status", "active")
        .order("id", { ascending: true })
        .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_document_entities")
        .select("document_id,entity_id,role,mention_count,confidence,evidence_text")
        .eq("owner_id", ownerId).gte("confidence", 0.6)
        .order("document_id", { ascending: true })
        .order("entity_id", { ascending: true })
        .order("role", { ascending: true })
        .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_events")
        .select("id,cluster_id,title,event_type,announced_at,occurred_at,confidence,review_status")
        .eq("owner_id", ownerId).neq("event_type", "other").neq("review_status", "rejected")
        .order("id", { ascending: true })
        .range(from, to)),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_event_evidence")
        .select("event_id,document_id").eq("owner_id", ownerId)
        .order("event_id", { ascending: true })
        .order("document_id", { ascending: true })
        .range(from, to)),
    contextPlan.includeSignalCatalog
      ? fetchPages<DbRow>((from, to) => admin.from("intelligence_event_concepts")
        .select("id,event_id,concept_id,confidence").eq("owner_id", ownerId).gte("confidence", 0.6)
        .order("id", { ascending: true })
        .range(from, to))
      : Promise.resolve([] as DbRow[]),
    buildingTermSupport
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_event_entities")
        .select("event_id,entity_id,role,source,confidence,extraction_version,metadata")
        .eq("owner_id", ownerId)
        .order("event_id", { ascending: true })
        .order("entity_id", { ascending: true })
        .order("role", { ascending: true })
        .range(from, to)),
    buildingTermSupport || !currentEventGeneration
      ? Promise.resolve([] as DbRow[])
      : fetchPages<DbRow>((from, to) => admin.from("intelligence_event_cluster_memberships")
        .select("generation_id,cluster_id,event_id,relationship,match_version")
        .eq("owner_id", ownerId)
        .eq("generation_id", currentEventGeneration.generationId)
        .eq("match_version", currentEventGeneration.matchVersion)
        .order("event_id", { ascending: true })
        .range(from, to)),
  ]) as Promise<SignalRefreshContextRows>;
  const contextCacheKey = contextPlan.cacheKey;
  let contextRowsPromise = buildingTermSupport
    ? loadContextRows()
    : signalRefreshContextCache.get(contextCacheKey);
  if (!contextRowsPromise) {
    contextRowsPromise = loadContextRows();
    signalRefreshContextCache.set(contextCacheKey, contextRowsPromise);
  }
  let contextRows: SignalRefreshContextRows;
  try {
    contextRows = await contextRowsPromise;
  } catch (error) {
    if (!buildingTermSupport) signalRefreshContextCache.delete(contextCacheKey);
    throw error;
  }
  const [segments, documents, identities, sources, refreshSegments,
    storyMemberships, documentMemberships, clusters, concepts,
    documentConcepts, entities, documentEntities, events, eventEvidence,
    eventConcepts, eventEntities, eventMemberships] = contextRows;

  const identityById = new Map(identities.map((row) => [String(row.id), row]));
  const sourceById = new Map(sources.map((row) => [String(row.id), row]));
  const documentById = new Map(documents.map((row) => [String(row.id), row]));
  const refreshSegmentIds = new Set(
    refreshSegments.map((row) => String(row.segment_id)),
  );
  if (!buildingTermSupport && !refreshSegmentIds.size) {
    throw new Error("Term signal segment snapshot is missing; restart this refresh from cursor 0.");
  }
  const measurementStoryClusterIds = new Set(
    clusters
      .filter((row) => isMeasurementStoryCluster(row, currentStoryGeneration))
      .map((row) => String(row.id)),
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

  const measurementSegments: Array<{
    row: DbRow;
    document: DbRow;
    date: string;
    identity: DbRow;
    sourceFamily: string;
  }> = [];
  for (const row of segments) {
    if (!buildingTermSupport && !refreshSegmentIds.has(String(row.id))) continue;
    const document = documentById.get(String(row.document_id)) ?? {};
    const publishedAt = String(document.published_at ?? document.created_at ?? "");
    const date = publishedAt.slice(0, 10);
    if (!date || date < startDate || date > completeThrough) continue;
    const identity = identityById.get(String(document.source_identity_id ?? "")) ?? {};
    const source = sourceById.get(sourceIdFromDocument(document, identity)) ?? {};
    if (!isMeasurementDocument({ document, identity, source, publishedAt })) continue;
    const sourceFamily = String(
      identity.normalized_family
        ?? identity.source_family
        ?? document.publisher_name
        ?? "unknown source",
    );
    measurementSegments.push({ row, document, date, identity, sourceFamily });
  }
  const recurringBoilerplateIds = recurringBoilerplateSegmentIds(
    measurementSegments.map(({ row, sourceFamily }) => ({
      id: String(row.id),
      documentId: String(row.document_id),
      contentHash: String(row.content_hash ?? ""),
      sourceFamily,
      title: String(row.title ?? ""),
      contentText: String(row.content_text ?? ""),
    })),
  );
  const items: SignalMeasurementItem[] = [];
  const itemBySegment = new Map<string, SignalMeasurementItem>();
  const itemsByDocument = new Map<string, SignalMeasurementItem[]>();
  const contentByItem = new Map<string, string>();
  for (const { row, date, identity, sourceFamily } of measurementSegments) {
    const segmentId = String(row.id);
    if (recurringBoilerplateIds.has(segmentId)) continue;
    const documentId = String(row.document_id);
    const item: SignalMeasurementItem = {
      id: segmentId,
      documentId,
      date,
      tokenCount: Number(row.token_count ?? 0),
      sourceFamily,
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

  if (buildingTermSupport) {
    if (items.length >= TERM_SIGNAL_FINALIZE_CURSOR_BASE) {
      throw new Error("The term support finalization cursor boundary must exceed the eligible item count.");
    }
    const support = await accumulateTermSignalSupport(admin, {
      ownerId,
      refreshId: options.refreshId,
      extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      startDate,
      endDate: completeThrough,
      segmentIds: items.map((item) => item.id),
      reset: signalCursor === 0,
      batchSize: options.supportLimit,
    });
    if (!support.processedSegmentCount && support.remainingSegmentCount) {
      throw new Error("Term signal support did not advance its saved cursor.");
    }
    if (support.remainingSegmentCount) {
      return {
        completeThrough,
        startDate,
        eligibleItemCount: items.length,
        observationCount: 0,
        processedCandidateTermCount: 0,
        processedSupportItemCount: support.processedSegmentCount,
        expectedTermObservationCount: 0,
        signalCount: 0,
        dailyRowCount: 0,
        removedStaleRows: 0,
        hasMore: true,
        nextCursor: signalCursor + support.processedSegmentCount,
        metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
        refreshStartedAt: options.refreshStartedAt,
        signalStage: "support" as const,
        eventDedupGenerationId: options.eventDedupGenerationId,
        storyDedupGenerationId: options.storyDedupGenerationId,
      };
    }
    const finalization = await finalizeTermSignalSupport(admin, {
      ownerId,
      refreshId: options.refreshId,
      extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
      startDate,
      endDate: completeThrough,
    });
    return {
      completeThrough,
      startDate,
      eligibleItemCount: items.length,
      observationCount: 0,
      processedCandidateTermCount: 0,
      processedSupportItemCount: support.processedSegmentCount,
      candidateTermCount: finalization.candidateTermCount,
      expectedTermObservationCount: 0,
      signalCount: 0,
      dailyRowCount: 0,
      removedStaleRows: 0,
      hasMore: true,
      nextCursor: finalization.hasMore
        ? TERM_SIGNAL_FINALIZE_CURSOR_BASE
        : TERM_SIGNAL_TERM_CURSOR_BASE,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      refreshStartedAt: options.refreshStartedAt,
      signalStage: "support" as const,
      eventDedupGenerationId: options.eventDedupGenerationId,
      storyDedupGenerationId: options.storyDedupGenerationId,
    };
  }

  const termBatch = await fetchTermSignalBatch(admin, {
    ownerId,
    refreshId: options.refreshId,
    extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
    startDate,
    endDate: completeThrough,
    cursor: termCursor,
    termLimit: options.termLimit,
  });
  const terms = termBatch.rows;

  const entityTypeById = new Map(
    entities.map((row) => [String(row.id), String(row.entity_type)]),
  );
  const directPrincipalsByEvent = directEventPrincipals(eventEntities, entityTypeById);
  const candidateEventIds = new Set(events.map((row) => String(row.id)));
  const candidateEventIdsByDocument = new Map<string, Set<string>>();
  const candidateMeasurementDocumentsByEvent = new Map<string, Set<string>>();
  for (const row of eventEvidence) {
    const eventId = String(row.event_id);
    const documentId = String(row.document_id);
    if (!candidateEventIds.has(eventId) || !itemsByDocument.has(documentId)) continue;
    const eventIds = candidateEventIdsByDocument.get(documentId) ?? new Set<string>();
    eventIds.add(eventId);
    candidateEventIdsByDocument.set(documentId, eventIds);
    const documentIds = candidateMeasurementDocumentsByEvent.get(eventId) ?? new Set<string>();
    documentIds.add(documentId);
    candidateMeasurementDocumentsByEvent.set(eventId, documentIds);
  }
  const atomicEventDocumentIds = new Set(
    [...candidateEventIdsByDocument]
      .filter(([, eventIds]) => eventIds.size === 1)
      .map(([documentId]) => documentId),
  );
  const documentPrincipalRows = new Map<
    string,
    Array<{ id: string; type: string; role: string }>
  >();
  for (const row of documentEntities) {
    const documentId = String(row.document_id);
    if (
      !atomicEventDocumentIds.has(documentId) ||
      Number(row.confidence ?? 0) < 0.65
    ) continue;
    const values = documentPrincipalRows.get(documentId) ?? [];
    values.push({
      id: String(row.entity_id),
      type: entityTypeById.get(String(row.entity_id)) ?? "",
      role: String(row.role ?? ""),
    });
    documentPrincipalRows.set(documentId, values);
  }
  const procurementPrincipal = (eventId: string) =>
    directPrincipalsByEvent.get(eventId)?.[0]?.id ??
    principalEntity(
      [...(candidateMeasurementDocumentsByEvent.get(eventId) ?? [])]
        .filter((documentId) => atomicEventDocumentIds.has(documentId))
        .flatMap((documentId) => documentPrincipalRows.get(documentId) ?? []),
    );
  const validEvents = events.filter((row) => validSignalEvent(
    row,
    completeThrough,
    Boolean(procurementPrincipal(String(row.id))),
  ));
  const validEventIds = new Set(validEvents.map((row) => String(row.id)));
  const actionKeyByEventId = analyticalActionKeyByEventId(
    validEvents,
    eventMemberships,
    currentEventGeneration,
  );
  const eventIdsByDocument = new Map<string, Set<string>>();
  const measurementDocumentsByEvent = new Map<string, Set<string>>();
  for (const [eventId, documentIds] of candidateMeasurementDocumentsByEvent) {
    if (!validEventIds.has(eventId)) continue;
    measurementDocumentsByEvent.set(eventId, documentIds);
    for (const documentId of documentIds) {
      const ids = eventIdsByDocument.get(documentId) ?? new Set<string>();
      ids.add(eventId);
      eventIdsByDocument.set(documentId, ids);
    }
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
    if (!isTrendEligibleNormalizedTerm(signalId)) continue;
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

  if (termCursor === 0) {
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
  }

  const trendableObservations = retainGloballySupportedSignalObservations(observations);
  const dailyRows = buildCanonicalSignalDailyRows({
    items,
    observations: trendableObservations,
  });
  const dailyTotalRows = buildSignalDailyTotals(items);
  const dailyTotals = new Map(dailyTotalRows.map((row) => [
    row.date,
    { items: row.items, tokens: row.tokens },
  ]));
  const historicalSummaries = summarizeCanonicalSignalHistory({
    rows: dailyRows,
    dailyTotals,
    completeThrough,
  });
  const summaries = historicalSummaries.latestByKey;
  const storedRows = dailyRows.flatMap((row) => {
    const summary = historicalSummaries.bySignalDate.get(`${row.signalKey}|${row.signalDate}`);
    if (!summary) return [];
    return [{
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
      refresh_id: options.refreshId,
      generation_started_at: options.refreshStartedAt,
      metadata: {
        ...row.metadata,
        event_dedup_generation_id: currentEventGeneration?.generationId ?? null,
        story_dedup_generation_id: currentStoryGeneration?.generationId ?? null,
        refresh_id: options.refreshId,
        refresh_started_at: options.refreshStartedAt,
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
    }];
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
      refresh_id: options.refreshId,
      generation_started_at: options.refreshStartedAt,
      metadata: {
        sourceFamilies: [],
        storyIds: [],
        actionIds: [],
        documentIds: [],
        sourceCounts: {},
        event_dedup_generation_id: currentEventGeneration?.generationId ?? null,
        story_dedup_generation_id: currentStoryGeneration?.generationId ?? null,
        refresh_id: options.refreshId,
        refresh_started_at: options.refreshStartedAt,
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

  const storedDailyTotals = completeSignalDailyTotals(dailyTotalRows, storedRows)
    .map((row) => ({
    owner_id: ownerId,
    metric_version: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    signal_date: row.date,
    eligible_items: row.items,
    eligible_tokens: row.tokens,
    refresh_id: options.refreshId,
    generation_started_at: options.refreshStartedAt,
    computed_at: new Date().toISOString(),
    }));
  for (
    let index = 0;
    index < storedDailyTotals.length;
    index += SIGNAL_DAILY_WRITE_BATCH_SIZE
  ) {
    const write = await admin.from("intelligence_signal_daily_totals").upsert(
      storedDailyTotals.slice(index, index + SIGNAL_DAILY_WRITE_BATCH_SIZE),
      { onConflict: "owner_id,refresh_id,metric_version,signal_date" },
    );
    if (write.error) {
      throw new Error(
        `signal denominator write ${index}-${Math.min(index + SIGNAL_DAILY_WRITE_BATCH_SIZE - 1, storedDailyTotals.length - 1)} failed: ${write.error.message}`,
      );
    }
  }

  for (
    let index = 0;
    index < storedRows.length;
    index += SIGNAL_DAILY_WRITE_BATCH_SIZE
  ) {
    const write = await admin.from("intelligence_signal_daily").upsert(
      storedRows.slice(index, index + SIGNAL_DAILY_WRITE_BATCH_SIZE),
      { onConflict: "owner_id,refresh_id,signal_key,signal_date,metric_version" },
    );
    if (write.error) {
      throw new Error(
        `signal row write ${index}-${Math.min(index + SIGNAL_DAILY_WRITE_BATCH_SIZE - 1, storedRows.length - 1)} failed: ${write.error.message}`,
      );
    }
  }

  let signalCount = summaries.size;
  let dailyRowCount = storedRows.length;
  let removedStaleRows = 0;
  let cleanupHasMore = false;
  const finalOrdinal = termBatch.nextCursor ?? termCursor;
  if (shouldReleaseSignalRefreshContext({
    termBatchHasMore: termBatch.hasMore,
    retainAcrossRefreshes: contextPlan.retainAcrossRefreshes,
  })) {
    signalRefreshContextCache.delete(contextCacheKey);
  }
  if (!termBatch.hasMore) {
    const completion = await completeCanonicalSignalGeneration(admin, {
      ownerId,
      refreshId: options.refreshId,
      refreshStartedAt: options.refreshStartedAt,
      startDate,
      completeThrough,
      finalOrdinal,
      promote: promoteGeneration,
      eventDedupGenerationId: currentEventGeneration?.generationId ?? null,
      storyDedupGenerationId: currentStoryGeneration?.generationId ?? null,
    });
    removedStaleRows = completion.removedCount;
    cleanupHasMore = completion.hasMore;
    signalCount = completion.signalCount ?? signalCount;
    dailyRowCount = completion.dailyRowCount ?? dailyRowCount;
  }

  const hasMore = termBatch.hasMore || cleanupHasMore;
  const nextCursor = termBatch.hasMore && termBatch.nextCursor !== null
    ? TERM_SIGNAL_TERM_CURSOR_BASE + termBatch.nextCursor
    : null;

  return {
    completeThrough,
    startDate,
    eligibleItemCount: items.length,
    observationCount: observations.length,
    processedCandidateTermCount: termBatch.candidateCount,
    expectedTermObservationCount: termBatch.observationCount,
    signalCount,
    dailyRowCount,
    removedStaleRows,
    hasMore,
    nextCursor,
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    refreshStartedAt: options.refreshStartedAt,
    signalStage: cleanupHasMore ? "cleanup" as const : "terms" as const,
    eventDedupGenerationId: currentEventGeneration?.generationId ?? null,
    storyDedupGenerationId: currentStoryGeneration?.generationId ?? null,
  };
}

export async function refreshSignalsV2(
  admin: SupabaseClient,
  ownerId: string,
  options: {
    completeThrough?: string;
    historyDays?: number;
    refreshId?: string;
    refreshStartedAt?: string;
    termLimit?: number;
    supportLimit?: number;
    promoteGeneration?: boolean;
    eventDedupGenerationId?: string | null;
    storyDedupGenerationId?: string | null;
  } = {},
) {
  const refreshId = options.refreshId ?? randomUUID();
  const refreshStartedAt = options.refreshStartedAt ?? new Date().toISOString();
  const completeThrough = options.completeThrough ?? latestCompleteDateKey();
  let cursor = 0;
  let batchCount = 0;
  let observationCount = 0;
  let processedCandidateTermCount = 0;
  let eventDedupGenerationId = options.eventDedupGenerationId;
  let storyDedupGenerationId = options.storyDedupGenerationId;
  let result: Awaited<ReturnType<typeof refreshSignalsV2Batch>> | null = null;
  do {
    result = await refreshSignalsV2Batch(admin, ownerId, {
      ...options,
      completeThrough,
      refreshId,
      refreshStartedAt,
      termCursor: cursor,
      termLimit: options.termLimit ?? DEFAULT_TERM_SIGNAL_BATCH_SIZE,
      eventDedupGenerationId,
      storyDedupGenerationId,
    });
    batchCount += 1;
    observationCount += result.observationCount;
    processedCandidateTermCount += result.processedCandidateTermCount;
    eventDedupGenerationId = result.eventDedupGenerationId;
    storyDedupGenerationId = result.storyDedupGenerationId;
    if (!result.hasMore) break;
    if (result.nextCursor === null || result.nextCursor <= cursor) {
      throw new Error("Term signal refresh did not advance its saved cursor.");
    }
    cursor = result.nextCursor;
  } while (true);

  return {
    ...result!,
    observationCount,
    processedCandidateTermCount,
    batchCount,
    refreshId,
    refreshStartedAt,
  };
}

export async function runIntelligenceV2BackfillStep(
  admin: SupabaseClient,
  ownerId: string,
  options: {
    phase?: "segmentation" | "terms" | "embeddings" | "concept_embeddings" | "topic_maintenance" | "dedupe" | "signals" | "all";
    cursor?: number;
    limit?: number;
    refreshId?: string;
    refreshStartedAt?: string;
    completeThrough?: string;
    historyDays?: number;
    windowStart?: string;
    dedupeLease?: IntelligenceDedupLeaseContext;
    eventDedupGenerationId?: string | null;
    storyDedupGenerationId?: string | null;
  } = {},
) {
  const phase = options.phase ?? "all";
  const completeThrough = options.completeThrough ?? latestCompleteDateKey();
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
      windowStart: options.windowStart,
    });
  }
  if (phase === "dedupe") {
    if (!options.dedupeLease) {
      throw new Error("Deduplication requires the owner signal-refresh lease.");
    }
    const dedupe = await rebuildStoryAndEventClustersV2(admin, ownerId, {
      completeThrough,
      lease: options.dedupeLease,
    });
    return { phase: "dedupe" as const, hasMore: false, nextCursor: null, dedupe };
  }
  if (phase === "signals") {
    const signals = await refreshSignalsV2Batch(admin, ownerId, {
      completeThrough,
      historyDays: options.historyDays,
      refreshId: options.refreshId ?? randomUUID(),
      refreshStartedAt: options.refreshStartedAt ?? new Date().toISOString(),
      termCursor: options.cursor,
      termLimit: options.limit,
      eventDedupGenerationId: options.eventDedupGenerationId,
      storyDedupGenerationId: options.storyDedupGenerationId,
    });
    return {
      phase: "signals" as const,
      hasMore: signals.hasMore,
      nextCursor: signals.nextCursor,
      signals,
    };
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
  const signals = await refreshSignalsV2Batch(admin, ownerId, {
    completeThrough,
    historyDays: options.historyDays,
    refreshId: options.refreshId ?? randomUUID(),
    refreshStartedAt: options.refreshStartedAt ?? new Date().toISOString(),
    termCursor: 0,
    termLimit: options.limit,
    eventDedupGenerationId: options.eventDedupGenerationId,
    storyDedupGenerationId: options.storyDedupGenerationId,
  });
  return {
    phase: "signals" as const,
    hasMore: signals.hasMore,
    nextCursor: signals.nextCursor,
    nextPhase: "signals" as const,
    terms,
    signals,
  };
}

export const __testables = {
  completeCanonicalSignalGeneration,
  completeSignalDailyTotals,
  conceptSignalKind,
  contextPageSize: PAGE_SIZE,
  entitySignalKind,
  isMeasurementDocument,
  isMeasurementStoryCluster,
  lensKeys,
  measurementSupportsEventSubject,
  recurringBoilerplateSegmentIds,
  resolveSignalDedupGenerations,
  signalRefreshContextCache,
  signalRefreshContextPlan,
  shouldReleaseSignalRefreshContext,
  segmentSupportsLabel,
  termSignalCursorState,
  validSignalEvent,
};
