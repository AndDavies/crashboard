import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptCredential,
  type EncryptedCredential,
} from "@/lib/intelligence/oauth-crypto";
import {
  getGmailMessage,
  gmailMessageToEnvelope,
  isNewsletterCandidate,
  listGmailMessageIds,
  newsletterBackfillQuery,
  refreshGmailAccessToken,
  type GmailStoredCredential,
} from "@/lib/intelligence/gmail";
import { processIntelligenceDocument } from "@/lib/intelligence/pipeline";

export type GmailSourceRow = {
  id: string;
  owner_id: string;
  name: string;
  config: Record<string, unknown> | null;
  checkpoint: Record<string, unknown> | null;
  credentials_ciphertext: string;
  credentials_iv: string;
  credentials_tag: string;
  last_synced_at: string | null;
};

export type GmailSyncMode = "backfill" | "incremental" | "discovery";

type GmailSyncCheckpoint = {
  mode: GmailSyncMode;
  query: string;
  cursor_key: string;
  pending_message_ids: string[];
  message_attempts: Record<string, number>;
  message_retry_failures: Record<string, number>;
  dead_letters: Record<string, GmailDeadLetter>;
  dead_letter_message_ids: string[];
  dead_letter_count: number;
  next_page_token: string | null;
  complete: boolean;
  window_start: string;
  window_end: string;
  sync_through_at: string | null;
  inflight_message_id?: string;
};

type GmailDeadLetter = {
  reason: string;
  attempts: number;
  failed_at: string | null;
  classification: "permanent" | "retry_exhausted" | "legacy";
};

type GmailCheckpointStore = {
  version: 2;
  modes: Partial<Record<GmailSyncMode, GmailSyncCheckpoint>>;
};

type RunningRunRow = {
  id: string;
  processed_count: number | null;
  failed_count: number | null;
  excluded_count: number | null;
  error_summary: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  created_at: string;
};

const STALE_RUN_AFTER_MS = 6 * 60 * 1000;
export const GMAIL_SYNC_TIME_BUDGET_MS = 210_000;
const MAX_SYNC_TIME_BUDGET_MS = 240_000;
const MIN_MESSAGE_START_BUDGET_MS = 120_000;
const MAX_TRANSIENT_FAILURES = 2;
const STALE_RUN_MESSAGE =
  "Run stopped without finalizing after its production heartbeat expired. The next run will resume from the last saved Gmail checkpoint.";

export class GmailSyncInProgressError extends Error {
  constructor(message = "A Gmail sync is already running for this source.") {
    super(message);
    this.name = "GmailSyncInProgressError";
  }
}

function credentialFromSource(source: GmailSourceRow) {
  return decryptCredential<GmailStoredCredential>({
    ciphertext: source.credentials_ciphertext,
    iv: source.credentials_iv,
    tag: source.credentials_tag,
  });
}

export async function gmailAccessTokenForSource(source: GmailSourceRow) {
  const credential = credentialFromSource(source);
  return {
    accessToken: await refreshGmailAccessToken(credential.refreshToken),
    email: credential.email ?? null,
  };
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function incrementalQuery(source: GmailSourceRow) {
  const end = new Date();
  const start = source.last_synced_at ? new Date(source.last_synced_at) : new Date();
  if (!source.last_synced_at) start.setUTCDate(start.getUTCDate() - 2);
  else start.setUTCDate(start.getUTCDate() - 1);
  return newsletterBackfillQuery(dateOnly(start), dateOnly(end));
}

function legacyIncrementalSyncThrough(
  source: GmailSourceRow,
  query: string,
  fallback: string,
) {
  if (source.last_synced_at && Number.isFinite(Date.parse(source.last_synced_at))) {
    return new Date(source.last_synced_at).toISOString();
  }
  const before = query.match(/\bbefore:(\d{4})\/(\d{2})\/(\d{2})\b/u);
  if (!before) return fallback;
  const boundary = new Date(`${before[1]}-${before[2]}-${before[3]}T00:00:00.000Z`);
  if (!Number.isFinite(boundary.getTime())) return fallback;
  boundary.setUTCDate(boundary.getUTCDate() - 1);
  return boundary.toISOString();
}

function discoveryQuery(windowStart: string, windowEnd: string) {
  const end = new Date(windowEnd);
  end.setUTCDate(end.getUTCDate() + 1);
  return `after:${windowStart.slice(0, 10).replaceAll("-", "/")} before:${dateOnly(end).replaceAll("-", "/")} -in:sent -in:drafts -in:spam -in:trash`;
}

function activityTime(run: RunningRunRow) {
  const parsed = Date.parse(run.heartbeat_at ?? run.started_at ?? run.created_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

function count(value: number | null | undefined) {
  return Math.max(0, Number(value ?? 0));
}

function checkpointFrom(
  mode: GmailSyncMode,
  query: string,
  cursorKey: string,
  windowStart: string,
  windowEnd: string,
  syncThroughAt: string | null,
  pendingMessageIds: string[],
  nextPageToken: string | null,
  messageAttempts: Record<string, number> = {},
  messageRetryFailures: Record<string, number> = {},
  deadLetters: Record<string, GmailDeadLetter> = {},
  inflightMessageId?: string,
): GmailSyncCheckpoint {
  const uniquePendingIds = [...new Set(pendingMessageIds)];
  const pendingSet = new Set(uniquePendingIds);
  const savedAttempts = Object.fromEntries(
    Object.entries(messageAttempts).filter(
      ([messageId, attempts]) =>
        pendingSet.has(messageId) && Number.isInteger(attempts) && attempts > 0,
    ),
  );
  const savedRetryFailures = Object.fromEntries(
    Object.entries(messageRetryFailures).filter(
      ([messageId, failures]) =>
        pendingSet.has(messageId) && Number.isInteger(failures) && failures > 0,
    ),
  );
  const savedDeadLetters = Object.fromEntries(
    Object.entries(deadLetters).filter(
      ([messageId, record]) =>
        messageId.length > 0 &&
        record &&
        typeof record === "object" &&
        typeof record.reason === "string",
    ),
  );
  return {
    mode,
    query,
    cursor_key: cursorKey,
    pending_message_ids: uniquePendingIds,
    message_attempts: savedAttempts,
    message_retry_failures: savedRetryFailures,
    dead_letters: savedDeadLetters,
    dead_letter_message_ids: Object.keys(savedDeadLetters),
    dead_letter_count: Object.keys(savedDeadLetters).length,
    next_page_token: nextPageToken,
    complete: pendingMessageIds.length === 0 && !nextPageToken,
    window_start: windowStart,
    window_end: windowEnd,
    sync_through_at: syncThroughAt,
    ...(inflightMessageId ? { inflight_message_id: inflightMessageId } : {}),
  };
}

function checkpointForQuery(
  checkpoint: Record<string, unknown>,
  mode: GmailSyncMode,
  query: string,
  cursorKey: string,
): GmailSyncCheckpoint | null {
  if (checkpoint.mode !== mode || checkpoint.query !== query) return null;
  if (
    typeof checkpoint.cursor_key === "string" &&
    checkpoint.cursor_key !== cursorKey
  ) {
    return null;
  }
  const pending = Array.isArray(checkpoint.pending_message_ids)
    ? checkpoint.pending_message_ids.filter(
        (messageId): messageId is string =>
          typeof messageId === "string" && messageId.length > 0,
      )
    : [];
  const pendingSet = new Set(pending);
  const attempts =
    checkpoint.message_attempts &&
    typeof checkpoint.message_attempts === "object" &&
    !Array.isArray(checkpoint.message_attempts)
      ? Object.fromEntries(
          Object.entries(checkpoint.message_attempts).filter(
            ([messageId, value]) =>
              pendingSet.has(messageId) &&
              Number.isInteger(Number(value)) &&
              Number(value) > 0,
          ).map(([messageId, value]) => [messageId, Number(value)]),
        )
      : {};
  const deadLetters = deadLettersForCheckpoint(checkpoint);
  const retryFailures =
    checkpoint.message_retry_failures &&
    typeof checkpoint.message_retry_failures === "object" &&
    !Array.isArray(checkpoint.message_retry_failures)
      ? Object.fromEntries(
          Object.entries(checkpoint.message_retry_failures).filter(
            ([messageId, value]) =>
              pendingSet.has(messageId) &&
              Number.isInteger(Number(value)) &&
              Number(value) > 0,
          ).map(([messageId, value]) => [messageId, Number(value)]),
        )
      : {};
  return {
    mode,
    query,
    cursor_key: cursorKey,
    pending_message_ids: [...new Set(pending)],
    message_attempts: attempts,
    message_retry_failures: retryFailures,
    dead_letters: deadLetters,
    dead_letter_message_ids: Object.keys(deadLetters),
    dead_letter_count: Object.keys(deadLetters).length,
    next_page_token:
      typeof checkpoint.next_page_token === "string"
        ? checkpoint.next_page_token
        : null,
    complete: checkpoint.complete === true,
    window_start:
      typeof checkpoint.window_start === "string" ? checkpoint.window_start : "",
    window_end:
      typeof checkpoint.window_end === "string" ? checkpoint.window_end : "",
    sync_through_at:
      typeof checkpoint.sync_through_at === "string"
        ? checkpoint.sync_through_at
        : null,
    ...(typeof checkpoint.inflight_message_id === "string"
      ? { inflight_message_id: checkpoint.inflight_message_id }
      : {}),
  };
}

function deadLettersForCheckpoint(
  checkpoint: Record<string, unknown>,
): Record<string, GmailDeadLetter> {
  const records: Record<string, GmailDeadLetter> = {};
  if (
    checkpoint.dead_letters &&
    typeof checkpoint.dead_letters === "object" &&
    !Array.isArray(checkpoint.dead_letters)
  ) {
    for (const [messageId, value] of Object.entries(checkpoint.dead_letters)) {
      if (!messageId || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const record = value as Record<string, unknown>;
      const classification =
        record.classification === "permanent" ||
        record.classification === "retry_exhausted"
          ? record.classification
          : "legacy";
      const attempts = Number(record.attempts ?? 0);
      records[messageId] = {
        reason:
          typeof record.reason === "string" && record.reason.length > 0
            ? record.reason
            : "Previously dead-lettered Gmail message.",
        attempts: Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0,
        failed_at:
          typeof record.failed_at === "string" ? record.failed_at : null,
        classification,
      };
    }
  }
  if (Array.isArray(checkpoint.dead_letter_message_ids)) {
    for (const messageId of checkpoint.dead_letter_message_ids) {
      if (typeof messageId !== "string" || !messageId || records[messageId]) continue;
      records[messageId] = {
        reason: "Previously dead-lettered Gmail message.",
        attempts: 0,
        failed_at: null,
        classification: "legacy",
      };
    }
  }
  return records;
}

function rawCheckpointForMode(
  checkpoint: Record<string, unknown>,
  mode: GmailSyncMode,
): Record<string, unknown> {
  if (
    checkpoint.modes &&
    typeof checkpoint.modes === "object" &&
    !Array.isArray(checkpoint.modes)
  ) {
    const candidate = (checkpoint.modes as Record<string, unknown>)[mode];
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
    return {};
  }
  return checkpoint.mode === mode ? checkpoint : {};
}

function checkpointStoreWithMode(
  currentStore: Record<string, unknown>,
  mode: GmailSyncMode,
  checkpoint: GmailSyncCheckpoint,
): GmailCheckpointStore & GmailSyncCheckpoint {
  const modes: Partial<Record<GmailSyncMode, GmailSyncCheckpoint>> = {};
  if (
    currentStore.modes &&
    typeof currentStore.modes === "object" &&
    !Array.isArray(currentStore.modes)
  ) {
    for (const candidateMode of ["backfill", "incremental", "discovery"] as const) {
      const candidate = (currentStore.modes as Record<string, unknown>)[candidateMode];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        modes[candidateMode] = candidate as GmailSyncCheckpoint;
      }
    }
  } else if (
    currentStore.mode === "backfill" ||
    currentStore.mode === "incremental" ||
    currentStore.mode === "discovery"
  ) {
    modes[currentStore.mode] = currentStore as unknown as GmailSyncCheckpoint;
  }
  modes[mode] = checkpoint;
  return { version: 2, modes, ...checkpoint };
}

function firstErrorSummary(errors: string[]) {
  if (!errors.length) return null;
  const first = errors[0].slice(0, 500);
  return `${errors.length} Gmail message${errors.length === 1 ? "" : "s"} failed in this run. First error: ${first}`;
}

function messageErrorMetadata(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const cause =
    value.cause && typeof value.cause === "object"
      ? (value.cause as Record<string, unknown>)
      : {};
  const status = Number(value.status ?? value.statusCode ?? cause.status ?? 0);
  const code = String(value.code ?? cause.code ?? "").toUpperCase();
  const message = error instanceof Error ? error.message : String(error);
  return { status, code, message };
}

function retryableMessageError(error: unknown) {
  const { status, code, message } = messageErrorMetadata(error);
  if (status === 408 || status === 429 || status >= 500) return true;
  if (
    [
      "ECONNRESET",
      "ECONNREFUSED",
      "EAI_AGAIN",
      "ENETDOWN",
      "ENETUNREACH",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_HEADERS_TIMEOUT",
    ].includes(code)
  ) {
    return true;
  }
  return /\b429\b|\b5\d\d\b|abort|did not return parsed|fetch failed|invalid json|network|rate limit|socket|temporar|timed?\s*out|timeout|unexpected end of json/iu.test(
    message,
  );
}

function messageErrorClassification(
  error: unknown,
  stage: "gmail" | "processing",
): "retryable" | "permanent" | "systemic" {
  const { status, code, message } = messageErrorMetadata(error);
  const systemicPattern =
    /api key|authentication|billing|column .* does not exist|credential|forbidden|insufficient[_ -]?quota|invalid[_ -]?api[_ -]?key|jwt|not configured|permission denied|pgrst|quota exceeded|relation .* does not exist|row.level security|schema cache|unauthorized/iu;
  if (
    status === 401 ||
    status === 403 ||
    code.includes("INSUFFICIENT_QUOTA") ||
    systemicPattern.test(message)
  ) {
    return "systemic";
  }
  if (retryableMessageError(error)) return "retryable";
  if (
    (stage === "gmail" &&
      (status === 400 || status === 404 || status === 410 ||
        /Google API request failed \((?:400|404|410)\)/iu.test(message))) ||
    /cannot persist an empty|content.*too long|empty intelligence document|input.*too long|invalid time value|malformed|maximum context length|message.*not found|no readable body|too many tokens|unsupported mime/iu.test(
      message,
    )
  ) {
    return "permanent";
  }
  return "systemic";
}

async function runningRuns(admin: SupabaseClient, sourceId: string) {
  const result = await admin
    .from("intelligence_runs")
    .select(
      "id,processed_count,failed_count,excluded_count,error_summary,heartbeat_at,started_at,created_at",
    )
    .eq("source_id", sourceId)
    .eq("status", "running");
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as RunningRunRow[];
}

/**
 * Finalize runs whose worker disappeared, while using the last heartbeat as a
 * compare-and-set guard so a live worker cannot be reconciled from a stale read.
 */
export async function reconcileStaleGmailRuns(
  admin: SupabaseClient,
  sourceId: string,
  now = new Date(),
) {
  const cutoff = now.getTime() - STALE_RUN_AFTER_MS;
  const rows = await runningRuns(admin, sourceId);

  for (const run of rows) {
    if (activityTime(run) >= cutoff) continue;
    const processed = count(run.processed_count);
    const excluded = count(run.excluded_count);
    const existingFailed = count(run.failed_count);
    const failed =
      processed + excluded + existingFailed === 0 ? 1 : existingFailed;
    const errorSummary = run.error_summary
      ? `${run.error_summary.slice(0, 500)} ${STALE_RUN_MESSAGE}`
      : STALE_RUN_MESSAGE;

    let update = admin
      .from("intelligence_runs")
      .update({
        status: "failed",
        failed_count: failed,
        error_summary: errorSummary,
        completed_at: now.toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running");
    update = run.heartbeat_at
      ? update.eq("heartbeat_at", run.heartbeat_at)
      : update.is("heartbeat_at", null);
    if (!run.heartbeat_at && run.started_at) {
      update = update.eq("started_at", run.started_at);
    }
    const result = await update.select("id").maybeSingle();
    if (result.error) throw new Error(result.error.message);
  }

  const remaining = await runningRuns(admin, sourceId);
  return {
    reconciledCount: Math.max(0, rows.length - remaining.length),
    activeRuns: remaining,
  };
}

export async function getGmailSource(
  admin: SupabaseClient,
  ownerId: string,
): Promise<GmailSourceRow | null> {
  const result = await admin
    .from("intelligence_sources")
    .select("id,owner_id,name,config,checkpoint,credentials_ciphertext,credentials_iv,credentials_tag,last_synced_at")
    .eq("owner_id", ownerId)
    .eq("source_type", "gmail")
    .eq("status", "active")
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as GmailSourceRow | null;
}

export async function syncGmailSource(
  admin: SupabaseClient,
  source: GmailSourceRow,
  input: {
    mode: GmailSyncMode;
    maxMessages?: number;
    windowStart?: string;
    windowEnd?: string;
    resetCheckpoint?: boolean;
    timeBudgetMs?: number;
  },
) {
  const startedMs = Date.now();
  const timeBudgetMs = Math.max(
    30_000,
    Math.min(input.timeBudgetMs ?? GMAIL_SYNC_TIME_BUDGET_MS, MAX_SYNC_TIME_BUDGET_MS),
  );
  const deadlineMs = startedMs + timeBudgetMs;
  const maxMessages = Math.max(1, Math.min(input.maxMessages ?? 1, 25));
  const requestedWindowStart = input.windowStart ?? "2026-01-10";
  const requestedWindowEnd = input.windowEnd ?? "2026-07-10";
  let checkpointStore: Record<string, unknown> = source.checkpoint ?? {};
  const previousCheckpoint = input.resetCheckpoint
    ? {}
    : rawCheckpointForMode(checkpointStore, input.mode);
  const frozenIncompleteCheckpoint =
    previousCheckpoint.mode === input.mode &&
    previousCheckpoint.complete !== true &&
    typeof previousCheckpoint.query === "string" &&
    previousCheckpoint.query.length > 0;
  const windowStart =
    frozenIncompleteCheckpoint &&
    typeof previousCheckpoint.window_start === "string" &&
    previousCheckpoint.window_start.length > 0
      ? previousCheckpoint.window_start
      : requestedWindowStart;
  const windowEnd =
    frozenIncompleteCheckpoint &&
    typeof previousCheckpoint.window_end === "string" &&
    previousCheckpoint.window_end.length > 0
      ? previousCheckpoint.window_end
      : requestedWindowEnd;
  // A Gmail page token is only valid for the exact query that produced it.
  // Freeze an incomplete checkpoint across date changes and resume that work
  // unit before computing a fresh incremental query.
  const query = frozenIncompleteCheckpoint
    ? String(previousCheckpoint.query)
    : input.mode === "backfill"
      ? newsletterBackfillQuery(windowStart, windowEnd)
      : input.mode === "discovery"
        ? discoveryQuery(windowStart, windowEnd)
        : incrementalQuery(source);
  // Gmail's date query only has day-level precision. Anchor incremental
  // checkpoints to last_synced_at so a completed run does not suppress a
  // second run later on the same day.
  const freshCursorKey =
    input.mode === "incremental"
      ? `${query}|${source.last_synced_at ?? "never"}`
      : query;
  const cursorKey =
    frozenIncompleteCheckpoint &&
    typeof previousCheckpoint.cursor_key === "string" &&
    previousCheckpoint.cursor_key.length > 0
      ? previousCheckpoint.cursor_key
      : freshCursorKey;
  const syncThroughAt =
    input.mode !== "incremental"
      ? null
      : frozenIncompleteCheckpoint
        ? typeof previousCheckpoint.sync_through_at === "string" &&
          Number.isFinite(Date.parse(previousCheckpoint.sync_through_at))
          ? new Date(previousCheckpoint.sync_through_at).toISOString()
          : legacyIncrementalSyncThrough(
              source,
              query,
              new Date(startedMs).toISOString(),
            )
        : new Date(startedMs).toISOString();
  const savedCheckpoint = checkpointForQuery(
    previousCheckpoint,
    input.mode,
    query,
    cursorKey,
  );

  const reconciliation = await reconcileStaleGmailRuns(admin, source.id);
  if (reconciliation.activeRuns.length) throw new GmailSyncInProgressError();

  const startedAt = new Date().toISOString();
  const initialCheckpoint =
    savedCheckpoint ??
    checkpointFrom(
      input.mode,
      query,
      cursorKey,
      windowStart,
      windowEnd,
      syncThroughAt,
      [],
      null,
    );
  const runResult = await admin
    .from("intelligence_runs")
    .insert({
      owner_id: source.owner_id,
      source_id: source.id,
      run_type: input.mode,
      status: "running",
      window_start: new Date(windowStart).toISOString(),
      window_end: new Date(windowEnd).toISOString(),
      checkpoint_before: previousCheckpoint,
      checkpoint_after: initialCheckpoint,
      heartbeat_at: startedAt,
      started_at: startedAt,
    })
    .select("id")
    .single();
  if (runResult.error) {
    if (runResult.error.code === "23505") throw new GmailSyncInProgressError();
    throw new Error(runResult.error.message);
  }
  const runId = String(runResult.data.id);

  let processed = 0;
  let failed = 0;
  let excluded = 0;
  let discovered = 0;
  let stoppedForBudget = false;
  let checkpoint = initialCheckpoint;
  let pendingMessageIds = [...(savedCheckpoint?.pending_message_ids ?? [])];
  let messageAttempts = { ...(savedCheckpoint?.message_attempts ?? {}) };
  let messageRetryFailures = {
    ...(savedCheckpoint?.message_retry_failures ?? {}),
  };
  let deadLetters = input.resetCheckpoint
    ? {}
    : deadLettersForCheckpoint(previousCheckpoint);
  let nextPageToken = savedCheckpoint?.next_page_token ?? null;
  const errors: string[] = [];
  const candidateSenders = new Map<
    string,
    { email: string; name: string; count: number }
  >();
  const existingCandidates = Array.isArray(source.config?.candidate_senders)
    ? (source.config.candidate_senders as Array<Record<string, unknown>>)
    : [];
  const candidateMap = new Map(
    existingCandidates.map((candidate) => [String(candidate.email), candidate]),
  );

  const runProgress = async (
    currentCheckpoint: GmailSyncCheckpoint,
    options: {
      provisionalFailure?: boolean;
      errorSummary?: string | null;
    } = {},
  ) => {
    const heartbeatAt = new Date().toISOString();
    const result = await admin
      .from("intelligence_runs")
      .update({
        discovered_count: discovered,
        processed_count: processed,
        failed_count: failed + (options.provisionalFailure ? 1 : 0),
        excluded_count: excluded,
        checkpoint_after: currentCheckpoint,
        error_summary: options.errorSummary ?? firstErrorSummary(errors),
        heartbeat_at: heartbeatAt,
      })
      .eq("id", runId)
      .eq("status", "running");
    if (result.error) throw new Error(result.error.message);
  };

  const sourceProgress = async (
    currentCheckpoint: GmailSyncCheckpoint,
    options: { complete?: boolean; lastError?: string | null } = {},
  ) => {
    checkpointStore = checkpointStoreWithMode(
      checkpointStore,
      input.mode,
      currentCheckpoint,
    );
    const update: Record<string, unknown> = {
      checkpoint: checkpointStore,
      last_error: options.lastError ?? null,
    };
    if (input.mode === "discovery") {
      update.config = {
        ...(source.config ?? {}),
        candidate_senders: [...candidateMap.values()],
      };
    }
    if (options.complete && input.mode === "incremental") {
      const completedThrough = currentCheckpoint.sync_through_at ?? syncThroughAt;
      if (!completedThrough) {
        throw new Error("Incremental checkpoint is missing sync_through_at.");
      }
      update.last_synced_at = completedThrough;
    }
    const result = await admin
      .from("intelligence_sources")
      .update(update)
      .eq("id", source.id);
    if (result.error) throw new Error(result.error.message);
  };

  try {
    if (!savedCheckpoint?.complete) {
      const credential = credentialFromSource(source);
      const accessToken = await refreshGmailAccessToken(credential.refreshToken);

      if (!pendingMessageIds.length) {
        const page = await listGmailMessageIds(accessToken, {
          query,
          pageToken: nextPageToken,
          maxResults: maxMessages,
        });
        const listedMessageIds = (page.messages ?? []).map((message) => message.id);
        pendingMessageIds = listedMessageIds.filter(
          (messageId) => !deadLetters[messageId],
        );
        excluded += listedMessageIds.length - pendingMessageIds.length;
        messageAttempts = {};
        messageRetryFailures = {};
        nextPageToken = page.nextPageToken ?? null;
        discovered = listedMessageIds.length;
        checkpoint = checkpointFrom(
          input.mode,
          query,
          cursorKey,
          windowStart,
          windowEnd,
          syncThroughAt,
          pendingMessageIds,
          nextPageToken,
          messageAttempts,
          messageRetryFailures,
          deadLetters,
        );
        await sourceProgress(checkpoint, { complete: checkpoint.complete });
        await runProgress(checkpoint);
      } else {
        discovered = pendingMessageIds.length;
        checkpoint = checkpointFrom(
          input.mode,
          query,
          cursorKey,
          windowStart,
          windowEnd,
          syncThroughAt,
          pendingMessageIds,
          nextPageToken,
          messageAttempts,
          messageRetryFailures,
          deadLetters,
        );
        await runProgress(checkpoint);
      }

      for (const messageId of [...pendingMessageIds]) {
        const priorAttempts = messageAttempts[messageId] ?? 0;
        if (deadlineMs - Date.now() < MIN_MESSAGE_START_BUDGET_MS) {
          stoppedForBudget = true;
          break;
        }

        const attemptNumber = priorAttempts + 1;
        messageAttempts[messageId] = attemptNumber;
        const inflightCheckpoint = checkpointFrom(
          input.mode,
          query,
          cursorKey,
          windowStart,
          windowEnd,
          syncThroughAt,
          pendingMessageIds,
          nextPageToken,
          messageAttempts,
          messageRetryFailures,
          deadLetters,
          messageId,
        );
        await sourceProgress(inflightCheckpoint, {
          lastError: firstErrorSummary(errors),
        });
        await runProgress(inflightCheckpoint, {
          provisionalFailure: true,
          errorSummary: `Processing Gmail message ${messageId}. If this worker stops, the message remains queued for the next run.`,
        });

        let messageStage: "gmail" | "processing" = "gmail";
        try {
          if (input.mode === "discovery") {
            const message = await getGmailMessage(accessToken, messageId, "metadata");
            messageStage = "processing";
            if (!isNewsletterCandidate(message)) {
              excluded += 1;
            } else {
              const envelope = gmailMessageToEnvelope(message, source.owner_id);
              const email = String(envelope.metadata?.sender_email ?? "");
              if (email) {
                const candidate = candidateSenders.get(email) ?? {
                  email,
                  name: envelope.publisherName ?? email,
                  count: 0,
                };
                candidate.count += 1;
                candidateSenders.set(email, candidate);
                const existing = candidateMap.get(email);
                candidateMap.set(email, {
                  email,
                  name: candidate.name,
                  count: Number(existing?.count ?? 0) + 1,
                  status: existing?.status ?? "candidate",
                });
              }
              processed += 1;
            }
          } else {
            const message = await getGmailMessage(accessToken, messageId, "full");
            messageStage = "processing";
            const envelope = gmailMessageToEnvelope(message, source.owner_id);
            await processIntelligenceDocument(admin, envelope, {
              openaiApiKey: process.env.OPENAI_API_KEY,
            });
            processed += 1;
          }
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : "Unknown message failure.";
          const classification = messageErrorClassification(error, messageStage);
          if (classification === "systemic") {
            if (priorAttempts > 0) messageAttempts[messageId] = priorAttempts;
            else delete messageAttempts[messageId];
            const systemicSummary =
              `${messageId}: systemic ${messageStage} failure; message remains pending. ${message}`;
            errors.push(systemicSummary);
            checkpoint = checkpointFrom(
              input.mode,
              query,
              cursorKey,
              windowStart,
              windowEnd,
              syncThroughAt,
              pendingMessageIds,
              nextPageToken,
              messageAttempts,
              messageRetryFailures,
              deadLetters,
            );
            await sourceProgress(checkpoint, {
              lastError: firstErrorSummary(errors),
            });
            await runProgress(checkpoint, { errorSummary: systemicSummary });
            throw new Error(systemicSummary);
          }

          const priorRetryFailures = messageRetryFailures[messageId] ?? 0;
          const retryFailureCount =
            classification === "retryable" ? priorRetryFailures + 1 : priorRetryFailures;
          if (classification === "retryable") {
            messageRetryFailures[messageId] = retryFailureCount;
          }
          const willRetry =
            classification === "retryable" &&
            retryFailureCount < MAX_TRANSIENT_FAILURES;
          errors.push(
            willRetry
              ? `${messageId}: transient failure; retry ${retryFailureCount + 1}/${MAX_TRANSIENT_FAILURES} is queued. ${message}`
              : classification === "retryable"
                ? `${messageId}: transient failure exhausted ${retryFailureCount}/${MAX_TRANSIENT_FAILURES} caught retries. ${message}`
                : `${messageId}: non-retryable failure; advanced after attempt ${attemptNumber}. ${message}`,
          );
          console.error(`[intelligence] Failed Gmail message ${messageId}.`, error);
          if (!willRetry) {
            // A single permanently malformed message must not block the source
            // forever. It advances immediately; transient errors get one later
            // invocation before they also advance.
            pendingMessageIds = pendingMessageIds.filter(
              (pendingId) => pendingId !== messageId,
            );
            deadLetters = {
              ...deadLetters,
              [messageId]: {
                reason: message,
                attempts:
                  classification === "retryable"
                    ? retryFailureCount
                    : attemptNumber,
                failed_at: new Date().toISOString(),
                classification:
                  classification === "retryable"
                    ? "retry_exhausted"
                    : "permanent",
              },
            };
            delete messageAttempts[messageId];
            delete messageRetryFailures[messageId];
          }
          checkpoint = checkpointFrom(
            input.mode,
            query,
            cursorKey,
            windowStart,
            windowEnd,
            syncThroughAt,
            pendingMessageIds,
            nextPageToken,
            messageAttempts,
            messageRetryFailures,
            deadLetters,
          );
          await sourceProgress(checkpoint, {
            complete: checkpoint.complete,
            lastError: firstErrorSummary(errors),
          });
          await runProgress(checkpoint);
          continue;
        }

        pendingMessageIds = pendingMessageIds.filter(
          (pendingId) => pendingId !== messageId,
        );
        delete messageAttempts[messageId];
        delete messageRetryFailures[messageId];
        checkpoint = checkpointFrom(
          input.mode,
          query,
          cursorKey,
          windowStart,
          windowEnd,
          syncThroughAt,
          pendingMessageIds,
          nextPageToken,
          messageAttempts,
          messageRetryFailures,
          deadLetters,
        );
        // The source checkpoint is the durable resume cursor, so advance it
        // before updating the diagnostic run row.
        await sourceProgress(checkpoint, { complete: checkpoint.complete });
        await runProgress(checkpoint);
      }
    }

    checkpoint = checkpointFrom(
      input.mode,
      query,
      cursorKey,
      windowStart,
      windowEnd,
      syncThroughAt,
      pendingMessageIds,
      nextPageToken,
      messageAttempts,
      messageRetryFailures,
      deadLetters,
    );
    const hasMore = !checkpoint.complete;
    const status = failed > 0 || hasMore || stoppedForBudget ? "partial" : "completed";
    const errorSummary = firstErrorSummary(errors);
    await sourceProgress(checkpoint, {
      complete: checkpoint.complete,
      lastError: errorSummary,
    });

    const completedAt = new Date().toISOString();
    const completed = await admin
      .from("intelligence_runs")
      .update({
        status,
        discovered_count: discovered,
        processed_count: processed,
        failed_count: failed,
        excluded_count: excluded,
        checkpoint_after: checkpoint,
        error_summary: errorSummary,
        heartbeat_at: completedAt,
        completed_at: completedAt,
      })
      .eq("id", runId)
      .eq("status", "running");
    if (completed.error) throw new Error(completed.error.message);

    return {
      runId,
      status,
      discovered,
      processed,
      failed,
      excluded,
      hasMore,
      pending: checkpoint.pending_message_ids.length,
      deadLettered: checkpoint.dead_letter_count,
      stoppedForBudget,
      // Trend refresh is deliberately outside the ingestion request. Awaiting
      // it here made an otherwise successful sync vulnerable to Vercel's hard
      // request timeout.
      trendSnapshots: 0,
      trendRefresh: "skipped" as const,
      candidateSenders: [...candidateSenders.values()],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail sync failed.";
    const completedAt = new Date().toISOString();
    const visibleFailed =
      processed + failed + excluded === 0 ? 1 : failed;
    const failedRun = await admin
      .from("intelligence_runs")
      .update({
        status: "failed",
        processed_count: processed,
        failed_count: visibleFailed,
        excluded_count: excluded,
        checkpoint_after: checkpoint,
        error_summary: message,
        heartbeat_at: completedAt,
        completed_at: completedAt,
      })
      .eq("id", runId)
      .eq("status", "running");
    if (failedRun.error) {
      console.error("[intelligence] Could not finalize failed Gmail run.", failedRun.error);
    }
    const sourceUpdate = await admin
      .from("intelligence_sources")
      .update({ last_error: message })
      .eq("id", source.id);
    if (sourceUpdate.error) {
      console.error("[intelligence] Could not save the Gmail source error.", sourceUpdate.error);
    }
    throw error;
  }
}

export function encryptedCredentialColumns(credential: EncryptedCredential) {
  return {
    credentials_ciphertext: credential.ciphertext,
    credentials_iv: credential.iv,
    credentials_tag: credential.tag,
  };
}
