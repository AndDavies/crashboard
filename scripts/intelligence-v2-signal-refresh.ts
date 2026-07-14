import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { disableOpenAiApiForLocalRun } from "../src/lib/intelligence/local-openai-policy";

config({ path: ".env.local" });

// Hard cost boundary: this local validation command is deterministic and must
// remain a zero-OpenAI-API workflow even when .env.local contains a usable key.
disableOpenAiApiForLocalRun();

import { createAdminClient } from "../src/lib/supabase/admin";
import {
  DEFAULT_POST_BACKFILL_REFRESH_TARGET,
  LOCAL_SIGNAL_REFRESH_JOB,
  LOCAL_SIGNAL_REFRESH_MODE_CLONED,
  LOCAL_SIGNAL_REFRESH_MODE_CURRENT,
  completedBackfillTermSupportSnapshot,
  completedPostBackfillRefreshGenerationId,
  localCurrentWindowRefreshRunId,
  localEvaluationSignalSnapshotFromCheckpoint,
  legacySignalAnchorForCompleteThrough,
  localSignalRefreshCanBeReclaimed,
  localSignalRefreshLeaseMatches,
  localSignalRefreshModeFromCheckpoint,
  localSignalRefreshRunId,
  localSignalRefreshStateFromCheckpoint,
  localSignalScoringIsComplete,
  localValidationStateMatchesSupportSnapshot,
  planLocalSignalRefresh,
  qualifiesCompletedClonedValidationRefresh,
  qualifiesCompletedCurrentWindowRefresh,
  qualifiesCompletedPostBackfillRefresh,
  runBoundedLocalValidationGenerationPrune,
  runLocalSignalRefreshPages,
  shouldReleaseClonedValidationContext,
  type LocalSignalRefreshMode,
  type LocalSignalRefreshProgress,
  type LocalEvaluationSignalSnapshot,
} from "../src/lib/intelligence/local-signal-refresh";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "../src/lib/intelligence/signal-metrics-v2";
import { latestCompleteDateKey } from "../src/lib/intelligence/signal-metrics";
import {
  refreshSignalsV2Batch,
  releaseSharedSignalRefreshValidationContext,
} from "../src/lib/intelligence/signal-refresh-v2";
import {
  cloneFinalizedTermSignalSupportBatch,
  type TermSignalSupportCloneProgress,
} from "../src/lib/intelligence/term-signal-refresh";
import { INTELLIGENCE_TERM_EXTRACTION_VERSION } from "../src/lib/intelligence/term-observations";
import {
  releaseSignalRefreshLease,
  requireSignalRefreshLease,
} from "../src/lib/intelligence/signal-refresh-lease";
import { refreshTrendSnapshots } from "../src/lib/intelligence/trends";
import { isCompletedIntelligenceV2BackfillRun } from "../src/lib/intelligence/v2-readiness";
import {
  loadIntelligenceEvaluationSignalSnapshot,
  pruneIntelligenceSignalGeneration,
} from "../src/lib/intelligence/signal-generations-v2";

type DbObject = Record<string, unknown>;

type RunRow = {
  id: string;
  status: string;
  started_at: string | null;
  heartbeat_at: string | null;
  completed_at: string | null;
  created_at: string;
  checkpoint_before: unknown;
  checkpoint_after: unknown;
  error_summary: string | null;
};

type BackfillRun = {
  id: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  checkpoint_after: unknown;
};

type ClaimedRun = { run: RunRow; leaseToken: string };

class LocalSignalRefreshLeaseLostError extends Error {}

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function object(value: unknown): DbObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as DbObject
    : {};
}

function validTimestamp(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function dateKey(value: unknown) {
  const candidate = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(candidate) ? candidate : undefined;
}

function checkpointMetricVersion(value: unknown): string | undefined {
  const checkpoint = object(value);
  const result = object(checkpoint.result);
  const signals = object(checkpoint.signals);
  const resultSignals = object(result.signals);
  const candidates = [
    checkpoint.metric_version,
    checkpoint.metricVersion,
    signals.metricVersion,
    result.metricVersion,
    resultSignals.metricVersion,
  ];
  return candidates.map(String).find((candidate) => candidate.startsWith("signals-v2."));
}

function checkpointJob(value: unknown) {
  return String(object(value).job ?? "");
}

function checkpointBackfillId(value: unknown) {
  return String(object(value).backfill_run_id ?? "");
}

function completedProgress(value: unknown): LocalSignalRefreshProgress | null {
  const checkpoint = object(value);
  const continuation = object(checkpoint.signal_continuation);
  const completeThrough = dateKey(continuation.completeThrough);
  const startDate = dateKey(continuation.startDate);
  const cursor = Number(continuation.cursor);
  const eventGenerationId = Object.prototype.hasOwnProperty.call(
    continuation,
    "eventDedupGenerationId",
  )
    ? String(continuation.eventDedupGenerationId ?? "").trim() || null
    : undefined;
  const storyGenerationId = Object.prototype.hasOwnProperty.call(
    continuation,
    "storyDedupGenerationId",
  )
    ? String(continuation.storyDedupGenerationId ?? "").trim() || null
    : undefined;
  if (
    checkpoint.job !== LOCAL_SIGNAL_REFRESH_JOB ||
    !localSignalScoringIsComplete(checkpoint) ||
    checkpoint.metric_version !== INTELLIGENCE_SIGNAL_METRIC_VERSION ||
    continuation.required !== false ||
    !completeThrough ||
    !startDate ||
    !Number.isFinite(cursor)
  ) {
    return null;
  }
  return {
    cursor: Math.max(0, Math.floor(cursor)),
    completeThrough,
    historyDays: Math.min(730, Math.max(112, Math.floor(
      Number(continuation.historyDays) || 395,
    ))),
    pageCount: Math.max(0, Math.floor(Number(checkpoint.signal_page_count ?? 0))),
    observationCount: Math.max(0, Math.floor(Number(checkpoint.observation_count ?? 0))),
    processedCandidateTermCount: Math.max(
      0,
      Math.floor(Number(checkpoint.processed_candidate_term_count ?? 0)),
    ),
    removedStaleRows: Math.max(0, Math.floor(Number(checkpoint.removed_stale_rows ?? 0))),
    required: false,
    startDate,
    signalCount: Math.max(0, Math.floor(Number(checkpoint.v2_signal_count ?? 0))),
    dailyRowCount: Math.max(0, Math.floor(Number(checkpoint.v2_daily_row_count ?? 0))),
    metricVersion: String(checkpoint.metric_version ?? ""),
    signalStage: String(checkpoint.signal_stage ?? "terms") === "cleanup"
      ? "cleanup"
      : "terms",
    ...(eventGenerationId !== undefined
      ? { eventDedupGenerationId: eventGenerationId }
      : {}),
    ...(storyGenerationId !== undefined
      ? { storyDedupGenerationId: storyGenerationId }
      : {}),
  };
}

async function latestCompletedBackfill(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
) {
  const result = await admin.from("intelligence_runs")
    .select("id,status,completed_at,created_at,checkpoint_after")
    .eq("owner_id", ownerId)
    .eq("run_type", "backfill")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(30);
  if (result.error) throw new Error(`Backfill lookup failed: ${result.error.message}`);
  const backfill = ((result.data ?? []) as BackfillRun[])
    .find(isCompletedIntelligenceV2BackfillRun);
  if (!backfill) {
    throw new Error("A completed Intelligence v2 backfill is required before validation refreshes.");
  }
  if (!validTimestamp(backfill.completed_at ?? backfill.created_at)) {
    throw new Error(`Completed backfill ${backfill.id} has no valid completion time.`);
  }
  const metricVersion = checkpointMetricVersion(backfill.checkpoint_after);
  if (metricVersion !== INTELLIGENCE_SIGNAL_METRIC_VERSION) {
    throw new Error(
      `Latest completed v2 backfill uses ${metricVersion ?? "an unversioned metric"}; expected ${INTELLIGENCE_SIGNAL_METRIC_VERSION}.`,
    );
  }
  return backfill;
}

async function signalRunsAfterBackfill(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  backfill: BackfillRun,
) {
  const baseline = validTimestamp(backfill.completed_at ?? backfill.created_at)!;
  const result = await admin.from("intelligence_runs")
    .select("id,status,started_at,heartbeat_at,completed_at,created_at,checkpoint_before,checkpoint_after,error_summary")
    .eq("owner_id", ownerId)
    .eq("run_type", "signal_refresh")
    .gte("created_at", baseline)
    .order("created_at", { ascending: true })
    .limit(200);
  if (result.error) throw new Error(`Signal-run lookup failed: ${result.error.message}`);
  return (result.data ?? []) as RunRow[];
}

function completedCurrentMetricRuns(
  runs: RunRow[],
  backfill: BackfillRun,
) {
  const backfillCompletedAt = validTimestamp(
    backfill.completed_at ?? backfill.created_at,
  )!;
  const generationIds = new Set<string>();
  return runs.filter((run) => {
    if (!qualifiesCompletedPostBackfillRefresh(run, {
      backfillId: backfill.id,
      backfillCompletedAt,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    })) return false;
    const generationId = completedPostBackfillRefreshGenerationId(run);
    if (!generationId || generationIds.has(generationId)) return false;
    generationIds.add(generationId);
    return true;
  });
}

function completedClonedValidationRuns(
  runs: RunRow[],
  backfill: BackfillRun,
  input: { supportEndDate: string; target: number },
) {
  const backfillCompletedAt = validTimestamp(
    backfill.completed_at ?? backfill.created_at,
  )!;
  const generationIds = new Set<string>();
  return runs.filter((run) => {
    if (!qualifiesCompletedClonedValidationRefresh(run, {
      backfillId: backfill.id,
      backfillCompletedAt,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      supportEndDate: input.supportEndDate,
      target: input.target,
    })) return false;
    const generationId = completedPostBackfillRefreshGenerationId(run);
    if (!generationId || generationIds.has(generationId)) return false;
    generationIds.add(generationId);
    return true;
  });
}

function completedCurrentWindowRuns(
  runs: RunRow[],
  backfill: BackfillRun,
  completeThrough: string,
) {
  const backfillCompletedAt = validTimestamp(
    backfill.completed_at ?? backfill.created_at,
  )!;
  const generationIds = new Set<string>();
  return runs.filter((run) => {
    if (!qualifiesCompletedCurrentWindowRefresh(run, {
      backfillId: backfill.id,
      backfillCompletedAt,
      completeThrough,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    })) return false;
    const generationId = completedPostBackfillRefreshGenerationId(run);
    if (!generationId || generationIds.has(generationId)) return false;
    generationIds.add(generationId);
    return true;
  });
}

function unresolvedRunAfterLatestCompletion(
  runs: RunRow[],
  backfill: BackfillRun,
) {
  const completedAt = [
    validTimestamp(backfill.completed_at ?? backfill.created_at),
    ...completedCurrentMetricRuns(runs, backfill)
      .map((run) => validTimestamp(run.completed_at)),
  ].flatMap((value) => value ? [Date.parse(value)] : []);
  const watermark = Math.max(...completedAt);
  return runs.filter((run) =>
    ["running", "partial"].includes(run.status) &&
    Date.parse(run.created_at) > watermark
  );
}

async function createRun(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    ownerId: string;
    backfillId: string;
    completeThrough?: string;
    historyDays: number;
    mode: LocalSignalRefreshMode;
    target: number;
    sequence: number;
    leaseToken: string;
  },
) {
  const startedAt = new Date().toISOString();
  const leaseToken = input.leaseToken;
  const runId = input.mode === LOCAL_SIGNAL_REFRESH_MODE_CURRENT
    ? localCurrentWindowRefreshRunId(
        input.backfillId,
        input.completeThrough ?? "",
        INTELLIGENCE_SIGNAL_METRIC_VERSION,
      )
    : localSignalRefreshRunId(
        input.backfillId,
        input.sequence,
        INTELLIGENCE_SIGNAL_METRIC_VERSION,
      );
  const checkpoint = {
    job: LOCAL_SIGNAL_REFRESH_JOB,
    phase: "scoring",
    validation_mode: input.mode,
    backfill_run_id: input.backfillId,
    target_additional_refreshes: input.target,
    series_index: input.sequence,
    lease_token: leaseToken,
    metric_version: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    signal_page_count: 0,
    observation_count: 0,
    processed_candidate_term_count: 0,
    removed_stale_rows: 0,
    signal_continuation: {
      required: true,
      strategy: "term_signal_v2",
      cursor: 0,
      refreshId: runId,
      refreshStartedAt: startedAt,
      ...(input.completeThrough
        ? { completeThrough: input.completeThrough }
        : {}),
      historyDays: input.historyDays,
    },
  };
  await requireSignalRefreshLease(admin, {
    ownerId: input.ownerId,
    leaseToken,
    holderRunId: runId,
    holderKind: "local_validation",
  });
  const result = await admin.from("intelligence_runs").insert({
    id: runId,
    owner_id: input.ownerId,
    run_type: "signal_refresh",
    status: "running",
    started_at: startedAt,
    heartbeat_at: startedAt,
    checkpoint_before: checkpoint,
    checkpoint_after: checkpoint,
  }).select("id,status,started_at,heartbeat_at,completed_at,created_at,checkpoint_before,checkpoint_after,error_summary").single();
  if (String(result.error?.code ?? "") === "23505") {
    throw new Error(
      `Signal refresh ${runId} was claimed concurrently; let the active local command continue.`,
    );
  }
  if (result.error) throw new Error(`Signal-run creation failed: ${result.error.message}`);
  return { run: result.data as RunRow, leaseToken } satisfies ClaimedRun;
}

async function resumeRun(
  admin: ReturnType<typeof createAdminClient>,
  ownerId: string,
  run: RunRow,
  leaseToken: string,
) {
  if (!localSignalRefreshCanBeReclaimed(run.status, run.heartbeat_at)) {
    throw new Error(
      `Signal refresh ${run.id} has a live six-minute lease; another local process may still own it.`,
    );
  }
  const heartbeatAt = new Date().toISOString();
  await requireSignalRefreshLease(admin, {
    ownerId,
    leaseToken,
    holderRunId: run.id,
    holderKind: "local_validation",
  });
  const checkpoint = {
    ...object(run.checkpoint_after),
    lease_token: leaseToken,
  };
  let claim = admin.from("intelligence_runs").update({
    status: "running",
    heartbeat_at: heartbeatAt,
    completed_at: null,
    error_summary: null,
    checkpoint_after: checkpoint,
  }).eq("owner_id", ownerId).eq("id", run.id).eq("status", run.status);
  claim = run.heartbeat_at
    ? claim.eq("heartbeat_at", run.heartbeat_at)
    : claim.is("heartbeat_at", null);
  const result = await claim
    .select("id,status,started_at,heartbeat_at,completed_at,created_at,checkpoint_before,checkpoint_after,error_summary")
    .maybeSingle();
  if (result.error) throw new Error(`Signal-run resume failed: ${result.error.message}`);
  if (!result.data) {
    throw new Error(`Signal refresh ${run.id} was claimed concurrently.`);
  }
  return { run: result.data as RunRow, leaseToken } satisfies ClaimedRun;
}

async function runOneRefresh(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    ownerId: string;
    backfillId: string;
    completeThrough?: string;
    mode: LocalSignalRefreshMode;
    target: number;
    sequence: number;
    run: RunRow;
    leaseToken: string;
    supportSnapshot: NonNullable<ReturnType<
      typeof completedBackfillTermSupportSnapshot
    >>;
  },
) {
  const runId = input.run.id;
  const renewSharedLease = async () => {
    try {
      await requireSignalRefreshLease(admin, {
        ownerId: input.ownerId,
        leaseToken: input.leaseToken,
        holderRunId: runId,
        holderKind: "local_validation",
      });
    } catch (error) {
      throw new LocalSignalRefreshLeaseLostError(
        error instanceof Error ? error.message : "Signal refresh lease was lost.",
      );
    }
  };
  try {
    const checkpoint = object(input.run.checkpoint_after);
    if (!localSignalRefreshLeaseMatches(checkpoint, input.leaseToken)) {
      throw new LocalSignalRefreshLeaseLostError(
        `Signal refresh ${runId} is no longer owned by this process.`,
      );
    }
    if (localSignalRefreshModeFromCheckpoint(checkpoint) !== input.mode) {
      throw new Error(`Signal refresh ${runId} has a different validation mode.`);
    }
    const continuation = object(checkpoint.signal_continuation);
    const refreshStartedAt = validTimestamp(
      continuation.refreshStartedAt ?? input.run.started_at ?? input.run.created_at,
    );
    if (!refreshStartedAt) throw new Error(`Signal refresh ${runId} has no valid start time.`);
    const savedState = localSignalRefreshStateFromCheckpoint(input.run.checkpoint_after, {
      runId,
      startedAt: refreshStartedAt,
    });
    if (!savedState) throw new Error(`Signal refresh ${runId} has an invalid local checkpoint.`);
    const stateMatchesWindow = input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED
      ? localValidationStateMatchesSupportSnapshot(
          savedState,
          input.supportSnapshot,
        )
      : Boolean(input.completeThrough) &&
        savedState.completeThrough === input.completeThrough &&
        savedState.historyDays === input.supportSnapshot.historyDays;
    if (!stateMatchesWindow) {
      throw new Error(
        `Signal refresh ${runId} does not match its pinned validation window.`,
      );
    }

    if (
      input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED &&
      savedState.cursor === 0
    ) {
      let cloneProgress: TermSignalSupportCloneProgress | null = null;
      for (let batch = 1; batch <= 10_000; batch += 1) {
        await renewSharedLease();
        cloneProgress = await cloneFinalizedTermSignalSupportBatch(admin, {
          ownerId: input.ownerId,
          sourceRefreshId: input.supportSnapshot.sourceRefreshId,
          targetRefreshId: runId,
          extractionVersion: input.supportSnapshot.extractionVersion,
          startDate: input.supportSnapshot.startDate,
          endDate: input.supportSnapshot.endDate,
          batchSize: 1_000,
        });
        await renewSharedLease();
        const heartbeatAt = new Date().toISOString();
        const cloneCheckpoint = await admin.from("intelligence_runs").update({
          status: "running",
          heartbeat_at: heartbeatAt,
          checkpoint_after: {
            ...checkpoint,
            phase: "cloning_support",
            validation_mode: input.mode,
            lease_token: input.leaseToken,
            signal_continuation: {
              ...continuation,
              required: true,
              strategy: "term_signal_v2",
              cursor: 0,
              refreshId: runId,
              refreshStartedAt,
              completeThrough: input.supportSnapshot.endDate,
              startDate: input.supportSnapshot.startDate,
              historyDays: input.supportSnapshot.historyDays,
            },
            term_support_clone: {
              source_refresh_id: cloneProgress.sourceRefreshId,
              target_refresh_id: cloneProgress.targetRefreshId,
              phase: cloneProgress.phase,
              complete: cloneProgress.complete,
              copied_segment_count: cloneProgress.copiedSegmentCount,
              source_segment_count: cloneProgress.sourceSegmentCount,
              copied_term_count: cloneProgress.copiedTermCount,
              source_term_count: cloneProgress.sourceTermCount,
            },
          },
        }).eq("owner_id", input.ownerId)
          .eq("id", runId)
          .eq("status", "running")
          .contains("checkpoint_after", { lease_token: input.leaseToken })
          .select("id")
          .maybeSingle();
        if (cloneCheckpoint.error) {
          throw new Error(
            `Term-support clone checkpoint failed: ${cloneCheckpoint.error.message}`,
          );
        }
        if (!cloneCheckpoint.data) {
          throw new LocalSignalRefreshLeaseLostError(
            `Signal refresh ${runId} lost its local lease while cloning term support.`,
          );
        }
        console.log(
          `Run ${runId}: cloned ${cloneProgress.copiedSegmentCount}/${cloneProgress.sourceSegmentCount} support segments and ${cloneProgress.copiedTermCount}/${cloneProgress.sourceTermCount} terms.`,
        );
        if (cloneProgress.complete) break;
      }
      if (!cloneProgress?.complete) {
        throw new Error("Term-support clone exceeded its bounded resumable batch limit.");
      }
    }

    const savedComplete = completedProgress(input.run.checkpoint_after);
    const progress = savedComplete ?? await runLocalSignalRefreshPages({
      refreshId: runId,
      refreshStartedAt,
      metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
      promoteGeneration: input.mode === LOCAL_SIGNAL_REFRESH_MODE_CURRENT,
      useExistingFinalizedTermSupport:
        input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED,
      sharedValidationContextSourceId:
        input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED
          ? input.supportSnapshot.sourceRefreshId
          : undefined,
      state: {
        ...savedState,
        completeThrough: savedState.completeThrough ??
          (input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED
            ? input.supportSnapshot.endDate
            : input.completeThrough),
        historyDays: input.supportSnapshot.historyDays,
      },
      runBatch: (batch) => refreshSignalsV2Batch(admin, input.ownerId, batch),
      checkpoint: async (page) => {
        await renewSharedLease();
        const heartbeatAt = new Date().toISOString();
        const write = await admin.from("intelligence_runs").update({
          status: "running",
          heartbeat_at: heartbeatAt,
          processed_count: page.signalCount,
          checkpoint_after: {
            job: LOCAL_SIGNAL_REFRESH_JOB,
            phase: page.required ? "scoring" : "v2_complete",
            validation_mode: input.mode,
            backfill_run_id: input.backfillId,
            target_additional_refreshes: input.target,
            series_index: input.sequence,
            lease_token: input.leaseToken,
            metric_version: page.metricVersion,
            signal_page_count: page.pageCount,
            observation_count: page.observationCount,
            processed_candidate_term_count: page.processedCandidateTermCount,
            removed_stale_rows: page.removedStaleRows,
            v2_signal_count: page.signalCount,
            v2_daily_row_count: page.dailyRowCount,
            signal_stage: page.signalStage,
            signal_continuation: {
              required: page.required,
              strategy: "term_signal_v2",
              cursor: page.cursor,
              refreshId: runId,
              refreshStartedAt,
              completeThrough: page.completeThrough,
              startDate: page.startDate,
              historyDays: page.historyDays,
              ...(page.eventDedupGenerationId !== undefined
                ? { eventDedupGenerationId: page.eventDedupGenerationId }
                : {}),
              ...(page.storyDedupGenerationId !== undefined
                ? { storyDedupGenerationId: page.storyDedupGenerationId }
                : {}),
            },
          },
        }).eq("owner_id", input.ownerId)
          .eq("id", runId)
          .eq("status", "running")
          .contains("checkpoint_after", { lease_token: input.leaseToken })
          .select("id")
          .maybeSingle();
        if (write.error) throw new Error(`Signal checkpoint failed: ${write.error.message}`);
        if (!write.data) {
          throw new LocalSignalRefreshLeaseLostError(
            `Signal refresh ${runId} lost its local lease before checkpointing.`,
          );
        }
        console.log(
          `Run ${runId}: page ${page.pageCount}, stage ${page.signalStage}, cursor ${page.cursor}${page.required ? "" : ", v2 complete"}.`,
        );
      },
    });

    let evaluationSignalSnapshot: LocalEvaluationSignalSnapshot | null = null;
    let validationGenerationPruned = input.mode !== LOCAL_SIGNAL_REFRESH_MODE_CLONED;
    if (input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED) {
      const savedCheckpoint = object(input.run.checkpoint_after);
      const snapshotIdentity = {
        refreshId: runId,
        startDate: progress.startDate,
        completeThrough: progress.completeThrough,
        metricVersion: progress.metricVersion,
      };
      evaluationSignalSnapshot = localEvaluationSignalSnapshotFromCheckpoint(
        savedCheckpoint,
        snapshotIdentity,
      );
      const signalContinuation = {
        required: false,
        strategy: "term_signal_v2",
        cursor: progress.cursor,
        refreshId: runId,
        refreshStartedAt,
        completeThrough: progress.completeThrough,
        startDate: progress.startDate,
        historyDays: progress.historyDays,
        ...(progress.eventDedupGenerationId !== undefined
          ? { eventDedupGenerationId: progress.eventDedupGenerationId }
          : {}),
        ...(progress.storyDedupGenerationId !== undefined
          ? { storyDedupGenerationId: progress.storyDedupGenerationId }
          : {}),
      };
      const saveValidationCheckpoint = async (
        phase: "validation_snapshot" | "validation_pruning" | "v2_complete",
        extra: Record<string, unknown>,
      ) => {
        await renewSharedLease();
        const heartbeatAt = new Date().toISOString();
        const write = await admin.from("intelligence_runs").update({
          status: "running",
          heartbeat_at: heartbeatAt,
          processed_count: progress.signalCount,
          checkpoint_after: {
            job: LOCAL_SIGNAL_REFRESH_JOB,
            phase,
            validation_mode: input.mode,
            backfill_run_id: input.backfillId,
            target_additional_refreshes: input.target,
            series_index: input.sequence,
            lease_token: input.leaseToken,
            metric_version: progress.metricVersion,
            signal_page_count: progress.pageCount,
            observation_count: progress.observationCount,
            processed_candidate_term_count: progress.processedCandidateTermCount,
            removed_stale_rows: progress.removedStaleRows,
            v2_signal_count: progress.signalCount,
            v2_daily_row_count: progress.dailyRowCount,
            signal_stage: progress.signalStage,
            signal_continuation: signalContinuation,
            ...extra,
          },
        }).eq("owner_id", input.ownerId)
          .eq("id", runId)
          .eq("status", "running")
          .contains("checkpoint_after", { lease_token: input.leaseToken })
          .select("id")
          .maybeSingle();
        if (write.error) {
          throw new Error(`Validation snapshot checkpoint failed: ${write.error.message}`);
        }
        if (!write.data) {
          throw new LocalSignalRefreshLeaseLostError(
            `Signal refresh ${runId} lost its local lease during validation cleanup.`,
          );
        }
      };

      if (!evaluationSignalSnapshot) {
        await renewSharedLease();
        const fingerprint = await loadIntelligenceEvaluationSignalSnapshot(admin, {
          ownerId: input.ownerId,
          ...snapshotIdentity,
        });
        evaluationSignalSnapshot = { ...fingerprint, ...snapshotIdentity };
        await saveValidationCheckpoint("validation_snapshot", {
          evaluation_signal_snapshot: evaluationSignalSnapshot,
          validation_generation_pruned: false,
        });
      }

      const savedPrune = object(savedCheckpoint.validation_generation_prune);
      const pruneProgress = await runBoundedLocalValidationGenerationPrune({
        state: {
          pages: Number(savedPrune.pages ?? 0),
          signalRowsDeleted: Number(savedPrune.signal_rows_deleted ?? 0),
          totalRowsDeleted: Number(savedPrune.total_rows_deleted ?? 0),
          generationDeleted: savedPrune.generation_deleted === true,
          alreadyPruned: savedPrune.already_pruned === true,
          complete: savedCheckpoint.validation_generation_pruned === true,
        },
        pruneBatch: async () => {
          await renewSharedLease();
          return pruneIntelligenceSignalGeneration(
            admin,
            input.ownerId,
            runId,
          );
        },
        checkpoint: async (pruned) => {
          validationGenerationPruned = pruned.complete;
          await saveValidationCheckpoint(
            pruned.complete ? "v2_complete" : "validation_pruning",
            {
              evaluation_signal_snapshot: evaluationSignalSnapshot,
              validation_generation_pruned: pruned.complete,
              validation_generation_prune: {
                pages: pruned.pages,
                signal_rows_deleted: pruned.signalRowsDeleted,
                total_rows_deleted: pruned.totalRowsDeleted,
                generation_deleted: pruned.generationDeleted,
                already_pruned: pruned.alreadyPruned,
              },
            },
          );
        },
      });
      validationGenerationPruned = pruneProgress.complete;
    }

    // The rollout requires v1 and v2 scoring in parallel. This is the same
    // bounded legacy refresh used by the scheduled route, without immediate
    // Gmail delivery or any external collection/model calls.
    await renewSharedLease();
    const legacyAnchor = legacySignalAnchorForCompleteThrough(
      progress.completeThrough,
    );
    const legacy = await refreshTrendSnapshots(admin, input.ownerId, legacyAnchor, {
      currentWindowsOnly: true,
    });
    await renewSharedLease();
    const completedAt = new Date().toISOString();
    const finish = await admin.from("intelligence_runs").update({
      status: "completed",
      heartbeat_at: completedAt,
      completed_at: completedAt,
      error_summary: null,
      processed_count: progress.signalCount,
      checkpoint_after: {
        job: LOCAL_SIGNAL_REFRESH_JOB,
        phase: "complete",
        validation_mode: input.mode,
        backfill_run_id: input.backfillId,
        target_additional_refreshes: input.target,
        series_index: input.sequence,
        lease_token: input.leaseToken,
        metric_version: progress.metricVersion,
        refresh_id: runId,
        refresh_started_at: refreshStartedAt,
        complete_through: progress.completeThrough,
        signal_page_count: progress.pageCount,
        observation_count: progress.observationCount,
        processed_candidate_term_count: progress.processedCandidateTermCount,
        removed_stale_rows: progress.removedStaleRows,
        v2_signal_count: progress.signalCount,
        v2_daily_row_count: progress.dailyRowCount,
        legacy_snapshot_count: legacy.snapshotCount,
        legacy_stale_deleted_count: legacy.staleDeletedCount,
        legacy_superseded_count: legacy.supersededCount,
        ...(evaluationSignalSnapshot
          ? { evaluation_signal_snapshot: evaluationSignalSnapshot }
          : {}),
        ...(input.mode === LOCAL_SIGNAL_REFRESH_MODE_CLONED
          ? { validation_generation_pruned: validationGenerationPruned }
          : {}),
        signal_continuation: {
          required: false,
          strategy: "term_signal_v2",
          cursor: progress.cursor,
          refreshId: runId,
          refreshStartedAt,
          completeThrough: progress.completeThrough,
          startDate: progress.startDate,
          historyDays: progress.historyDays,
          ...(progress.eventDedupGenerationId !== undefined
            ? { eventDedupGenerationId: progress.eventDedupGenerationId }
            : {}),
          ...(progress.storyDedupGenerationId !== undefined
            ? { storyDedupGenerationId: progress.storyDedupGenerationId }
            : {}),
        },
      },
    }).eq("owner_id", input.ownerId)
      .eq("id", runId)
      .eq("status", "running")
      .contains("checkpoint_after", { lease_token: input.leaseToken })
      .select("id")
      .maybeSingle();
    if (finish.error) throw new Error(`Signal-run completion failed: ${finish.error.message}`);
    if (!finish.data) {
      throw new LocalSignalRefreshLeaseLostError(
        `Signal refresh ${runId} lost its local lease before completion.`,
      );
    }
    return { runId, progress, legacy };
  } catch (error) {
    const stoppedAt = new Date().toISOString();
    if (!(error instanceof LocalSignalRefreshLeaseLostError)) {
      await admin.from("intelligence_runs").update({
        status: "partial",
        heartbeat_at: stoppedAt,
        completed_at: stoppedAt,
        error_summary: error instanceof Error ? error.message : String(error),
      }).eq("owner_id", input.ownerId)
        .eq("id", runId)
        .eq("status", "running")
        .contains("checkpoint_after", { lease_token: input.leaseToken });
    }
    throw error;
  } finally {
    try {
      await releaseSignalRefreshLease(admin, {
        ownerId: input.ownerId,
        leaseToken: input.leaseToken,
      });
    } catch (error) {
      console.error(
        `Signal refresh ${runId} lease release failed; it will expire automatically.`,
        error,
      );
    }
  }
}

async function main() {
  const ownerId = argument("--owner") ?? process.env.INTELLIGENCE_OWNER_ID?.trim();
  if (!ownerId) throw new Error("Pass --owner or configure INTELLIGENCE_OWNER_ID.");
  const rawTarget = Number(
    argument("--target") ?? DEFAULT_POST_BACKFILL_REFRESH_TARGET,
  );
  if (!Number.isInteger(rawTarget) || rawTarget < 1 || rawTarget > 20) {
    throw new Error("--target must be an integer from 1 to 20.");
  }
  const requireCurrentWindow = process.argv.includes("--require-current-window");

  const admin = createAdminClient();
  const backfill = await latestCompletedBackfill(admin, ownerId);
  const supportSnapshot = completedBackfillTermSupportSnapshot(backfill, {
    metricVersion: INTELLIGENCE_SIGNAL_METRIC_VERSION,
    extractionVersion: INTELLIGENCE_TERM_EXTRACTION_VERSION,
  });
  if (!supportSnapshot) {
    throw new Error(
      `Completed backfill ${backfill.id} does not record one finalized term-support refresh and date window.`,
    );
  }
  const baseline = validTimestamp(backfill.completed_at ?? backfill.created_at)!;
  console.log(
    `Using completed v2 backfill ${backfill.id} at ${baseline}; target ${rawTarget} cloned ${INTELLIGENCE_SIGNAL_METRIC_VERSION} refreshes${requireCurrentWindow ? " plus one current-window refresh" : ""}.`,
  );

  while (true) {
    const coordinationLeaseToken = randomUUID();
    await requireSignalRefreshLease(admin, {
      ownerId,
      leaseToken: coordinationLeaseToken,
      holderRunId: randomUUID(),
      holderKind: "local_validation",
    });
    let handedToRun = false;
    try {
      // The target decision is made while holding the same owner lease used by
      // the scheduled route. A scheduled completion cannot make this count
      // stale before the chosen local run is inserted or resumed.
      const runs = await signalRunsAfterBackfill(admin, ownerId, backfill);
      const completedCloned = completedClonedValidationRuns(runs, backfill, {
        supportEndDate: supportSnapshot.endDate,
        target: rawTarget,
      });
      const currentCompleteThrough = latestCompleteDateKey();
      const completedCurrentWindow = completedCurrentWindowRuns(
        runs,
        backfill,
        currentCompleteThrough,
      );
      const plan = planLocalSignalRefresh({
        target: rawTarget,
        completedClonedRefreshes: completedCloned.length,
        requireCurrentWindow,
        currentWindowCompleted: completedCurrentWindow.length > 0,
        latestCompleteThrough: currentCompleteThrough,
        supportEndDate: supportSnapshot.endDate,
      });
      if (shouldReleaseClonedValidationContext(plan)) {
        releaseSharedSignalRefreshValidationContext(
          ownerId,
          supportSnapshot.sourceRefreshId,
        );
      }
      if (plan.kind === "complete") {
        if (plan.reason === "current_window_already_complete") {
          console.log(
            `Post-backfill validation complete: ${completedCloned.length}/${rawTarget} cloned refreshes and one local refresh through ${currentCompleteThrough} are recorded.`,
          );
        } else if (plan.reason === "current_window_not_newer") {
          console.log(
            `Post-backfill validation complete: ${completedCloned.length}/${rawTarget} cloned refreshes are recorded, and the backfill already reaches the latest complete day ${currentCompleteThrough}.`,
          );
        } else {
          console.log(
            `Post-backfill validation complete: ${completedCloned.length}/${rawTarget} cloned refreshes recorded.`,
          );
        }
        return;
      }

      const unresolved = unresolvedRunAfterLatestCompletion(runs, backfill);
      const local = runs.filter((run) =>
        ["running", "partial"].includes(run.status) &&
        checkpointJob(run.checkpoint_after) === LOCAL_SIGNAL_REFRESH_JOB &&
        checkpointBackfillId(run.checkpoint_after) === backfill.id
      );
      const foreign = unresolved.filter((run) =>
        checkpointJob(run.checkpoint_after) !== LOCAL_SIGNAL_REFRESH_JOB ||
        checkpointBackfillId(run.checkpoint_after) !== backfill.id
      );
      const blockingForeign = foreign[0];
      if (blockingForeign) {
        throw new Error(
          `Scheduled signal refresh ${blockingForeign.id} is unfinished; let that production run complete before starting local validation.`,
        );
      }
      const mode = plan.kind === "current_window"
        ? LOCAL_SIGNAL_REFRESH_MODE_CURRENT
        : LOCAL_SIGNAL_REFRESH_MODE_CLONED;
      const completeThrough = plan.kind === "current_window"
        ? plan.completeThrough
        : undefined;
      const intendedRunId = plan.kind === "current_window"
        ? localCurrentWindowRefreshRunId(
            backfill.id,
            plan.completeThrough,
            INTELLIGENCE_SIGNAL_METRIC_VERSION,
          )
        : localSignalRefreshRunId(
            backfill.id,
            plan.sequence,
            INTELLIGENCE_SIGNAL_METRIC_VERSION,
          );
      const matchingLocal = local.filter((run) =>
        run.id === intendedRunId &&
        localSignalRefreshModeFromCheckpoint(run.checkpoint_after) === mode
      );
      if (local.length !== matchingLocal.length) {
        throw new Error(
          "A different local validation refresh is unfinished; refusing to change its saved window or generation pins.",
        );
      }
      if (matchingLocal.length > 1) {
        throw new Error("More than one matching local validation refresh exists; refusing an ambiguous resume.");
      }

      const sequence = plan.sequence;
      const claimed = matchingLocal[0]
        ? await resumeRun(
            admin,
            ownerId,
            matchingLocal[0],
            coordinationLeaseToken,
          )
        : await createRun(admin, {
          ownerId,
          backfillId: backfill.id,
          completeThrough,
          historyDays: supportSnapshot.historyDays,
          mode,
          target: rawTarget,
          sequence,
          leaseToken: coordinationLeaseToken,
        });
      handedToRun = true;
      const result = await runOneRefresh(admin, {
        ownerId,
        backfillId: backfill.id,
        completeThrough,
        mode,
        target: rawTarget,
        sequence,
        run: claimed.run,
        leaseToken: claimed.leaseToken,
        supportSnapshot,
      });
      console.log(plan.kind === "current_window"
        ? `Recorded current-window refresh through ${plan.completeThrough}: run ${result.runId}, ${result.progress.signalCount} v2 signals, ${result.legacy.snapshotCount} legacy snapshots.`
        : `Recorded cloned refresh ${sequence}/${rawTarget}: run ${result.runId}, ${result.progress.signalCount} v2 signals, ${result.legacy.snapshotCount} legacy snapshots.`);
    } finally {
      if (!handedToRun) {
        try {
          await releaseSignalRefreshLease(admin, {
            ownerId,
            leaseToken: coordinationLeaseToken,
          });
        } catch (error) {
          console.error(
            "Local signal refresh coordination lease release failed; it will expire automatically.",
            error,
          );
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
