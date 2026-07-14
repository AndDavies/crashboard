import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

import { createAdminClient } from "../src/lib/supabase/admin";
import { currentSegmentArtifactCoverage } from "../src/lib/intelligence/artifact-coverage-v2";
import {
  DEFAULT_BACKFILL_SIGNAL_BATCH_SIZE,
  backfillSignalBatchSize,
  backfillSignalCheckpoint,
  backfillSignalStateCheckpoint,
  savedBackfillSignalRefresh,
  withTransientSignalPageRetry,
  type BackfillSignalRefreshResume,
} from "../src/lib/intelligence/backfill-signal-refresh";
import { rebuildStoryAndEventClustersV2 } from "../src/lib/intelligence/dedup-v2";
import { INTELLIGENCE_EMBEDDING_MODEL } from "../src/lib/intelligence/enrichment";
import { refreshSegmentEmbeddingsBatch } from "../src/lib/intelligence/hybrid-search-v2";
import {
  runLocalSignalRefreshPages,
  type LocalSignalRefreshProgress,
} from "../src/lib/intelligence/local-signal-refresh";
import {
  assertNoOpenAiEmbeddingCoverage,
  assertCompatibleLocalOpenAiFlags,
  disableOpenAiApiForLocalRun,
  LEGACY_CODEX_TOPIC_REVIEW_FLAG,
  NO_OPENAI_FLAG,
  requestsNoOpenAi,
} from "../src/lib/intelligence/local-openai-policy";
import {
  prepareNewsletterResegmentation,
  resegmentNewsletterBatch,
} from "../src/lib/intelligence/resegmentation-v2";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "../src/lib/intelligence/signal-metrics-v2";
import { refreshSignalsV2Batch } from "../src/lib/intelligence/signal-refresh-v2";
import { latestCompleteDateKey } from "../src/lib/intelligence/signal-metrics";
import {
  releaseSignalRefreshLease,
  requireSignalRefreshLease,
} from "../src/lib/intelligence/signal-refresh-lease";
import { INTELLIGENCE_SEGMENT_PARSER_VERSION } from "../src/lib/intelligence/segments";
import {
  INTELLIGENCE_TERM_EXTRACTION_VERSION,
  refreshTermObservationsBatch,
} from "../src/lib/intelligence/term-observations";
import {
  refreshConceptEmbeddingsBatch,
  runTopicMaintenance,
} from "../src/lib/intelligence/topic-maintenance-v2";

type Phase = "segmentation" | "terms" | "embeddings" | "concept_embeddings" | "topic_maintenance" | "dedupe" | "signals" | "complete";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function flag(name: string) {
  return process.argv.includes(name);
}

function validDateOnly(value: unknown) {
  const candidate = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : undefined;
}

function exactCount(
  label: string,
  result: { count: number | null; error: { message: string } | null },
) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.count === null) throw new Error(`${label}: exact count was not returned.`);
  return result.count;
}

function completion(completed: number, total: number) {
  return {
    coverage: total === 0 ? (completed === 0 ? 1 : 0) : Math.min(completed, total) / total,
    complete: completed === total,
  };
}

async function fetchRows<T>(
  query: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  const pageSize = 250;
  for (let from = 0; ; from += pageSize) {
    const result = await withTransientSignalPageRetry(async () => {
      const page = await query(from, from + pageSize - 1);
      if (page.error) throw new Error(page.error.message);
      return page;
    }, { maxAttempts: 3 });
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < pageSize) return rows;
  }
}

async function verifyCurrentArtifactCoverage(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
) {
  const [segments, termStates, segmentEmbeddings, concepts, conceptEmbeddings] = await Promise.all([
    fetchRows<{ id: string; content_hash: string }>((from, to) => admin
      .from("intelligence_document_segments")
      .select("id,content_hash")
      .eq("owner_id", ownerId)
      .in("segment_type", ["editorial", "unknown"])
      .is("exclusion_reason", null)
      .order("id", { ascending: true })
      .range(from, to)),
    fetchRows<{ segment_id: string; content_hash: string }>((from, to) => admin
      .from("intelligence_term_processing_state")
      .select("segment_id,content_hash")
      .eq("owner_id", ownerId)
      .eq("extraction_version", INTELLIGENCE_TERM_EXTRACTION_VERSION)
      .order("segment_id", { ascending: true })
      .range(from, to)),
    fetchRows<{ segment_id: string; content_hash: string }>((from, to) => admin
      .from("intelligence_segment_embeddings")
      .select("segment_id,content_hash")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .order("segment_id", { ascending: true })
      .range(from, to)),
    fetchRows<{ id: string; taxonomy_version: string }>((from, to) => admin
      .from("intelligence_concepts")
      .select("id,taxonomy_version")
      .eq("owner_id", ownerId)
      .in("status", ["active", "candidate"])
      .order("id", { ascending: true })
      .range(from, to)),
    fetchRows<{ concept_id: string; taxonomy_version: string }>((from, to) => admin
      .from("intelligence_concept_embeddings")
      .select("concept_id,taxonomy_version")
      .eq("owner_id", ownerId)
      .eq("embedding_model", INTELLIGENCE_EMBEDDING_MODEL)
      .order("concept_id", { ascending: true })
      .range(from, to)),
  ]);
  const artifacts = currentSegmentArtifactCoverage({
    segments,
    termStates,
    segmentEmbeddings,
  });
  const conceptKeys = new Set(conceptEmbeddings.map((row) =>
    `${row.concept_id}|${row.taxonomy_version}`
  ));
  return {
    ...artifacts,
    missingSegments: artifacts.missingEmbeddings,
    concepts: concepts.length,
    missingConcepts: concepts.filter((row) =>
      !conceptKeys.has(`${row.id}|${row.taxonomy_version}`)
    ).length,
  };
}

async function coverage(admin: ReturnType<typeof createAdminClient>, ownerId: string) {
  const [documents, parserV2Documents, current] = await Promise.all([
    admin.from("documents").select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId).eq("source_type", "email_newsletter"),
    admin.from("documents").select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId).eq("source_type", "email_newsletter")
      .contains("metadata", { segment_parser_version: INTELLIGENCE_SEGMENT_PARSER_VERSION }),
    verifyCurrentArtifactCoverage(admin, ownerId),
  ]);
  const newsletterDocumentCount = exactCount("newsletter document count failed", documents);
  const parserV2DocumentCount = exactCount("segmented newsletter count failed", parserV2Documents);
  const eligibleSegmentCount = current.eligibleSegments;
  const termStateCount = current.currentTermCount;
  const embeddedSegmentCount = current.currentEmbeddingCount;
  const conceptCount = current.concepts;
  const embeddedConceptCount = current.concepts - current.missingConcepts;
  const terms = completion(termStateCount, eligibleSegmentCount);
  const segmentEmbeddings = completion(embeddedSegmentCount, eligibleSegmentCount);
  const conceptEmbeddings = completion(embeddedConceptCount, conceptCount);
  return {
    newsletterDocuments: newsletterDocumentCount,
    parserV2Documents: parserV2DocumentCount,
    eligibleSegments: eligibleSegmentCount,
    termProcessedSegments: termStateCount,
    termCoverage: terms.coverage,
    termsComplete: terms.complete,
    embeddedSegments: embeddedSegmentCount,
    embeddingCoverage: segmentEmbeddings.coverage,
    embeddingsComplete: segmentEmbeddings.complete,
    concepts: conceptCount,
    embeddedConcepts: embeddedConceptCount,
    conceptEmbeddingCoverage: conceptEmbeddings.coverage,
    conceptEmbeddingsComplete: conceptEmbeddings.complete,
  };
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  assertCompatibleLocalOpenAiFlags(process.argv);
  const noOpenAi = requestsNoOpenAi(process.argv);
  if (noOpenAi) {
    disableOpenAiApiForLocalRun();
    console.log(
      "OpenAI API calls are disabled. Existing production-compatible embeddings will be verified before local analysis continues.",
    );
  }
  if (flag(LEGACY_CODEX_TOPIC_REVIEW_FLAG) && !flag(NO_OPENAI_FLAG)) {
    console.warn(
      `${LEGACY_CODEX_TOPIC_REVIEW_FLAG} is a backwards-compatible alias for ${NO_OPENAI_FLAG}. ` +
      "It uses deterministic topic names pending a separate local Codex review; it does not invoke Codex.",
    );
  }
  const requestedRunId = argument("--run-id")?.trim();
  const admin = createAdminClient();
  let previousRunsQuery = admin.from("intelligence_runs")
    .select("id,status,checkpoint_after,created_at")
    .eq("owner_id", ownerId).eq("run_type", "backfill");
  if (requestedRunId) previousRunsQuery = previousRunsQuery.eq("id", requestedRunId);
  const previousRuns = await previousRunsQuery
    .order("created_at", { ascending: false })
    .limit(requestedRunId ? 1 : 20);
  if (previousRuns.error) throw new Error(previousRuns.error.message);
  const resumable = (previousRuns.data ?? []).find((run) => {
    const checkpoint = run.checkpoint_after as Record<string, unknown> | null;
    return checkpoint?.job === "intelligence_v2" && run.status !== "completed";
  });
  if (requestedRunId && !resumable) {
    throw new Error(`Run ${requestedRunId} is not an unfinished Intelligence v2 backfill.`);
  }
  const checkpoint = resumable?.checkpoint_after as Record<string, unknown> | null;
  const savedSignalContinuation = checkpoint?.signal_continuation &&
      typeof checkpoint.signal_continuation === "object" &&
      !Array.isArray(checkpoint.signal_continuation)
    ? checkpoint.signal_continuation as Record<string, unknown>
    : null;
  const completeThrough = validDateOnly(
    checkpoint?.signal_complete_through ??
      savedSignalContinuation?.completeThrough ?? checkpoint?.completeThrough,
  )
    ?? validDateOnly(argument("--complete-through"))
    ?? latestCompleteDateKey();
  const signalTermBatchSize = backfillSignalBatchSize(
    argument("--signal-term-batch") ?? DEFAULT_BACKFILL_SIGNAL_BATCH_SIZE,
  );
  let phase = (checkpoint?.phase as Phase | undefined) ?? "segmentation";
  const checkpointCursor = Math.max(0, Number(checkpoint?.cursor ?? 0));
  const checkpointNextCursor = Number(checkpoint?.nextCursor);
  let cursor = Number.isFinite(checkpointNextCursor) && checkpointNextCursor > checkpointCursor
    ? checkpointNextCursor
    : checkpointCursor;
  const savedTopicMaintenance = checkpoint?.topicMaintenance &&
      typeof checkpoint.topicMaintenance === "object"
    ? checkpoint.topicMaintenance as Record<string, unknown>
    : null;
  const savedTopicWindowStart = String(
    checkpoint?.topicWindowStart ?? savedTopicMaintenance?.windowStart ?? "",
  ).slice(0, 10);
  let topicWindowStart = /^\d{4}-\d{2}-\d{2}$/u.test(savedTopicWindowStart)
    ? savedTopicWindowStart
    : undefined;
  let runId = resumable?.id ? String(resumable.id) : "";
  if (!runId) {
    const run = await admin.from("intelligence_runs").insert({
      owner_id: ownerId,
      run_type: "backfill",
      status: "running",
      started_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      checkpoint_after: {
        job: "intelligence_v2",
        phase,
        cursor,
        completeThrough,
        ...(noOpenAi ? { openaiMode: "disabled" } : {}),
      },
    }).select("id").single();
    if (run.error) throw new Error(run.error.message);
    runId = String(run.data.id);
  } else {
    const resume = await admin.from("intelligence_runs").update({
      status: "running",
      heartbeat_at: new Date().toISOString(),
      error_summary: null,
    }).eq("id", runId);
    if (resume.error) throw new Error(resume.error.message);
  }
  let signalRefreshState: BackfillSignalRefreshResume | null = phase === "signals"
    ? savedBackfillSignalRefresh(checkpoint, {
        runId,
        completeThrough,
        fallbackStartedAt: new Date().toISOString(),
      })
    : null;
  let lastSignalProgress: LocalSignalRefreshProgress | null = null;
  const save = async (nextPhase: Phase, nextCursor: number, progress: Record<string, unknown>) => {
    const write = await admin.from("intelligence_runs").update({
      status: nextPhase === "complete" ? "completed" : "running",
      heartbeat_at: new Date().toISOString(),
      completed_at: nextPhase === "complete" ? new Date().toISOString() : null,
      checkpoint_after: {
        job: "intelligence_v2",
        phase: nextPhase,
        cursor: nextCursor,
        completeThrough,
        ...progress,
        ...(noOpenAi ? { openaiMode: "disabled" } : {}),
        ...(topicWindowStart ? { topicWindowStart } : {}),
      },
    }).eq("id", runId);
    if (write.error) throw new Error(write.error.message);
    phase = nextPhase;
    cursor = nextCursor;
  };

  try {
    // A nonzero signal cursor means this exact run already passed artifact
    // coverage and embedding verification before it created its frozen signal
    // snapshot. Repeating archive-wide exact counts after a transient write
    // failure adds load and can itself exceed PostgREST's statement timeout.
    const continuingSignalRefresh = phase === "signals" &&
      Boolean(signalRefreshState && signalRefreshState.cursor > 0);
    const initial = continuingSignalRefresh ? null : await coverage(admin, ownerId);
    if (initial) {
      console.log("Initial coverage", initial);
      if (
        noOpenAi &&
        ["topic_maintenance", "dedupe", "signals"].includes(phase)
      ) {
        assertNoOpenAiEmbeddingCoverage(initial);
      }
    } else {
      console.log(
        "Resuming the previously verified signal snapshot at cursor",
        signalRefreshState?.cursor,
      );
    }
    while (phase !== "complete") {
      if (phase === "segmentation") {
        const current = initial ?? await coverage(admin, ownerId);
        if (flag("--skip-segmentation") || current.parserV2Documents >= current.newsletterDocuments) {
          await save("terms", 0, { skipped: "segmentation" });
          continue;
        }
        const segmentationContext = await prepareNewsletterResegmentation(admin, ownerId);
        const result = await resegmentNewsletterBatch(admin, ownerId, segmentationContext, {
          cursor,
          limit: Number(argument("--segment-batch") ?? 25),
        });
        console.log("Segmentation", result);
        await save(result.hasMore ? "segmentation" : "terms", result.nextCursor ?? 0, { segmentation: result });
        continue;
      }
      if (phase === "terms") {
        if (flag("--skip-terms")) {
          await save("embeddings", 0, { skipped: "terms" });
          continue;
        }
        const current = cursor === 0 ? await coverage(admin, ownerId) : null;
        if (current?.termsComplete) {
          await save("embeddings", 0, { skipped: "terms", termCoverage: current.termCoverage });
          continue;
        }
        const result = await refreshTermObservationsBatch(admin, ownerId, { cursor, limit: 100 });
        console.log("Terms", result);
        if (result.complete) {
          const verified = await verifyCurrentArtifactCoverage(admin, ownerId);
          if (verified.missingTerms > 0) {
            await save("terms", 0, {
              terms: result,
              verification: {
                eligibleSegments: verified.eligibleSegments,
                missingTerms: verified.missingTerms,
                restartedFromZero: true,
              },
            });
            continue;
          }
        }
        await save(result.complete ? "embeddings" : "terms", result.nextCursor ?? 0, { terms: result });
        continue;
      }
      if (phase === "embeddings") {
        if (noOpenAi) {
          const current = await coverage(admin, ownerId);
          assertNoOpenAiEmbeddingCoverage(current, { requireConcepts: false });
          await save("concept_embeddings", 0, {
            skipped: "embeddings",
            reason: "no_openai_current_embeddings_verified",
            embeddingCoverage: current.embeddingCoverage,
          });
          continue;
        }
        if (flag("--skip-embeddings")) {
          await save("concept_embeddings", 0, { skipped: "embeddings" });
          continue;
        }
        const current = cursor === 0 ? await coverage(admin, ownerId) : null;
        const verifiedCurrent = current?.embeddingsComplete
          ? await verifyCurrentArtifactCoverage(admin, ownerId)
          : null;
        if (verifiedCurrent && verifiedCurrent.missingSegments === 0) {
          await save("concept_embeddings", 0, {
            skipped: "embeddings",
            embeddingCoverage: current?.embeddingCoverage ?? 1,
          });
          continue;
        }
        const result = await refreshSegmentEmbeddingsBatch(admin, ownerId, {
          cursor,
          limit: Number(argument("--embedding-batch") ?? 25),
        });
        console.log("Embeddings", result);
        if (!result.hasMore) {
          const verified = await verifyCurrentArtifactCoverage(admin, ownerId);
          if (verified.missingSegments > 0) {
            await save("embeddings", 0, {
              embeddings: result,
              verification: {
                eligibleSegments: verified.eligibleSegments,
                missingSegments: verified.missingSegments,
                restartedFromZero: true,
              },
            });
            continue;
          }
        }
        await save(result.hasMore ? "embeddings" : "concept_embeddings", result.nextCursor ?? 0, { embeddings: result });
        continue;
      }
      if (phase === "concept_embeddings") {
        if (noOpenAi) {
          const current = await coverage(admin, ownerId);
          assertNoOpenAiEmbeddingCoverage(current);
          await save("topic_maintenance", 0, {
            skipped: "concept_embeddings",
            reason: "no_openai_current_embeddings_verified",
            conceptEmbeddingCoverage: current.conceptEmbeddingCoverage,
          });
          continue;
        }
        if (flag("--skip-embeddings")) {
          await save("topic_maintenance", 0, { skipped: "concept_embeddings" });
          continue;
        }
        const current = cursor === 0 ? await coverage(admin, ownerId) : null;
        const verifiedCurrent = current?.conceptEmbeddingsComplete
          ? await verifyCurrentArtifactCoverage(admin, ownerId)
          : null;
        if (verifiedCurrent && verifiedCurrent.missingConcepts === 0) {
          await save("topic_maintenance", 0, {
            skipped: "concept_embeddings",
            conceptEmbeddingCoverage: current?.conceptEmbeddingCoverage ?? 1,
          });
          continue;
        }
        const result = await refreshConceptEmbeddingsBatch(admin, ownerId, {
          cursor,
          limit: Number(argument("--embedding-batch") ?? 25),
        });
        console.log("Concept embeddings", result);
        if (!result.hasMore) {
          const verified = await verifyCurrentArtifactCoverage(admin, ownerId);
          if (verified.missingConcepts > 0) {
            await save("concept_embeddings", 0, {
              conceptEmbeddings: result,
              verification: {
                concepts: verified.concepts,
                missingConcepts: verified.missingConcepts,
                restartedFromZero: true,
              },
            });
            continue;
          }
        }
        await save(result.hasMore ? "concept_embeddings" : "topic_maintenance", result.nextCursor ?? 0, { conceptEmbeddings: result });
        continue;
      }
      if (phase === "topic_maintenance") {
        if (flag("--skip-topic-maintenance")) {
          await save("dedupe", 0, { skipped: "topic_maintenance" });
          continue;
        }
        // With --no-openai, topic assignment and clustering reuse verified
        // vectors while naming stays deterministic pending local Codex review.
        const result = await runTopicMaintenance(admin, ownerId, {
          cursor,
          lookbackDays: 180,
          segmentLimit: Number(argument("--topic-batch") ?? 400),
          graphLimit: Number(argument("--topic-graph-batch") ?? 5),
          windowStart: topicWindowStart,
        });
        topicWindowStart = result.windowStart;
        console.log("Topic maintenance", result);
        await save(result.hasMore ? "topic_maintenance" : "dedupe", result.nextCursor ?? 0, {
          topicMaintenance: result,
          topicNaming: noOpenAi
            ? "deterministic_pending_codex_review"
            : "configured_model",
        });
        continue;
      }
      if (phase === "dedupe") {
        if (flag("--skip-dedupe")) {
          await save("signals", 0, { skipped: "dedupe" });
          continue;
        }
        const lease = {
          leaseToken: randomUUID(),
          holderRunId: runId,
          holderKind: "local_validation" as const,
        };
        await requireSignalRefreshLease(admin, {
          ownerId,
          ...lease,
          ttlSeconds: 1_800,
        });
        let result: Awaited<ReturnType<typeof rebuildStoryAndEventClustersV2>>;
        try {
          result = await rebuildStoryAndEventClustersV2(admin, ownerId, {
            completeThrough,
            lease,
          });
        } finally {
          await releaseSignalRefreshLease(admin, {
            ownerId,
            leaseToken: lease.leaseToken,
          });
        }
        console.log("Deduplication", result);
        await save("signals", 0, { dedupe: result });
        continue;
      }
      if (phase === "signals") {
        const signalLease = {
          leaseToken: randomUUID(),
          holderRunId: runId,
          holderKind: "local_validation" as const,
        };
        const renewSignalLease = () => requireSignalRefreshLease(admin, {
          ownerId,
          ...signalLease,
          ttlSeconds: 1_800,
        });
        await renewSignalLease();
        try {
          signalRefreshState ??= savedBackfillSignalRefresh({
            job: "intelligence_v2",
            phase: "signals",
          }, {
            runId,
            completeThrough,
            fallbackStartedAt: new Date().toISOString(),
          });
          const identity = {
            refreshId: signalRefreshState.refreshId,
            refreshStartedAt: signalRefreshState.refreshStartedAt,
          };
          // Save the generation and fixed window before the first expensive page,
          // including when an older run reached this phase without v2 checkpointing.
          await save("signals", signalRefreshState.cursor, {
            ...backfillSignalStateCheckpoint(identity, signalRefreshState),
            signal_term_batch_size: signalTermBatchSize,
          });
          const result = await runLocalSignalRefreshPages({
            ...identity,
            metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
            state: signalRefreshState,
            runBatch: async (batch) => {
              await renewSignalLease();
              const page = await withTransientSignalPageRetry(
                () => refreshSignalsV2Batch(admin, ownerId, {
                  ...batch,
                  termLimit: signalTermBatchSize,
                  supportLimit: signalTermBatchSize,
                }),
                {
                  onRetry: (error, nextAttempt) => {
                    console.warn(
                      `Signal page failed transiently; retrying attempt ${nextAttempt}.`,
                      error instanceof Error ? error.message : String(error),
                    );
                  },
                },
              );
              // A page may take long enough for the lease to expire. Reclaim it
              // with the same token before accepting the page or checkpointing.
              await renewSignalLease();
              return page;
            },
            checkpoint: async (progress, page) => {
              await renewSignalLease();
              signalRefreshState = {
                ...identity,
                cursor: progress.cursor,
                completeThrough: progress.completeThrough,
                historyDays: progress.historyDays,
                pageCount: progress.pageCount,
                observationCount: progress.observationCount,
                processedCandidateTermCount:
                  progress.processedCandidateTermCount,
                removedStaleRows: progress.removedStaleRows,
                ...(progress.eventDedupGenerationId !== undefined
                  ? { eventDedupGenerationId: progress.eventDedupGenerationId }
                  : {}),
                ...(progress.storyDedupGenerationId !== undefined
                  ? { storyDedupGenerationId: progress.storyDedupGenerationId }
                  : {}),
              };
              lastSignalProgress = progress;
              await save("signals", progress.cursor, {
                ...backfillSignalCheckpoint(identity, progress),
                signal_term_batch_size: signalTermBatchSize,
                signals: page,
              });
            },
          });
          if (result.required) {
            throw new Error("Signal refresh stopped before its final page.");
          }
          console.log("Signals", result);
          await renewSignalLease();
          await save("complete", 0, {
            ...backfillSignalCheckpoint(identity, result),
            signal_term_batch_size: signalTermBatchSize,
            signals: {
              ...result,
              refreshId: identity.refreshId,
              refreshStartedAt: identity.refreshStartedAt,
              batchCount: result.pageCount,
            },
          });
        } finally {
          try {
            await releaseSignalRefreshLease(admin, {
              ownerId,
              leaseToken: signalLease.leaseToken,
            });
          } catch (error) {
            console.error(
              "Backfill signal lease release failed; it will expire automatically.",
              error,
            );
          }
        }
      }
    }
    console.log(`Intelligence v2 backfill complete. Run ${runId}.`);
  } catch (error) {
    const signalFailureCheckpoint = phase === "signals" && signalRefreshState
      ? lastSignalProgress
        ? backfillSignalCheckpoint({
            refreshId: signalRefreshState.refreshId,
            refreshStartedAt: signalRefreshState.refreshStartedAt,
          }, lastSignalProgress)
        : backfillSignalStateCheckpoint({
            refreshId: signalRefreshState.refreshId,
            refreshStartedAt: signalRefreshState.refreshStartedAt,
          }, signalRefreshState)
      : {};
    const partial = await admin.from("intelligence_runs").update({
      status: "partial",
      heartbeat_at: new Date().toISOString(),
      error_summary: error instanceof Error ? error.message : String(error),
      checkpoint_after: {
        job: "intelligence_v2",
        phase,
        cursor,
        completeThrough,
        ...(noOpenAi ? { openaiMode: "disabled" } : {}),
        ...(topicWindowStart ? { topicWindowStart } : {}),
        ...signalFailureCheckpoint,
        ...(phase === "signals"
          ? { signal_term_batch_size: signalTermBatchSize }
          : {}),
      },
    }).eq("id", runId);
    if (partial.error) {
      console.error("Failed to save the partial backfill checkpoint.", partial.error.message);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
