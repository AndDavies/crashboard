import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listResult: {
    messages: [] as Array<{ id: string; threadId: string }>,
    nextPageToken: undefined as string | undefined,
  },
  process: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/intelligence/oauth-crypto", () => ({
  decryptCredential: () => ({ refreshToken: "refresh-token" }),
}));

vi.mock("@/lib/intelligence/gmail", () => ({
  getGmailMessage: vi.fn(async (_token: string, messageId: string) => ({ id: messageId })),
  gmailMessageToEnvelope: (message: { id: string }, ownerId: string) => ({
    ownerId,
    sourceType: "email_newsletter",
    externalId: message.id,
    originalUrl: `https://mail.google.test/${message.id}`,
    contentText: `Body for ${message.id}`,
  }),
  isNewsletterCandidate: () => true,
  listGmailMessageIds: mocks.list,
  newsletterBackfillQuery: (start: string, end: string) =>
    `after:${start} before:${end} label:test`,
  refreshGmailAccessToken: vi.fn(async () => "access-token"),
}));

vi.mock("@/lib/intelligence/pipeline", () => ({
  processIntelligenceDocument: mocks.process,
}));

import {
  GmailSyncInProgressError,
  reconcileStaleGmailRuns,
  syncGmailSource,
  type GmailSourceRow,
} from "@/lib/intelligence/jobs";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is"; column: string; value: unknown };

class FakeQuery implements PromiseLike<{ data: unknown; error: null }> {
  private operation: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private filters: Filter[] = [];

  constructor(private database: FakeDatabase, private table: string) {}

  select() {
    return this;
  }

  insert(payload: Row) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  single() {
    return this.resolve(true);
  }

  maybeSingle() {
    return this.resolve(true);
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.resolve(false).then(onfulfilled, onrejected);
  }

  private resolve(single: boolean) {
    return Promise.resolve(
      this.database.execute(
        this.table,
        this.operation,
        this.payload,
        this.filters,
        single,
      ),
    );
  }
}

class FakeDatabase {
  runs: Row[] = [];
  sourceUpdates: Row[] = [];
  runUpdates: Row[] = [];
  nextRunId = 1;

  from(table: string) {
    return new FakeQuery(this, table);
  }

  execute(
    table: string,
    operation: "select" | "insert" | "update",
    payload: Row | null,
    filters: Filter[],
    single: boolean,
  ) {
    if (table === "intelligence_sources" && operation === "update") {
      this.sourceUpdates.push(structuredClone(payload ?? {}));
      return { data: null, error: null };
    }

    if (table !== "intelligence_runs") {
      return { data: single ? null : [], error: null };
    }

    if (operation === "insert") {
      const row = { id: `run-${this.nextRunId++}`, ...(payload ?? {}) };
      this.runs.push(row);
      return { data: { id: row.id }, error: null };
    }

    const matches = this.runs.filter((row) =>
      filters.every((filter) =>
        filter.kind === "is"
          ? (row[filter.column] ?? null) === filter.value
          : row[filter.column] === filter.value,
      ),
    );

    if (operation === "update") {
      this.runUpdates.push(structuredClone(payload ?? {}));
      for (const row of matches) Object.assign(row, payload ?? {});
      const data = matches.map((row) => ({ id: row.id }));
      return { data: single ? (data[0] ?? null) : data, error: null };
    }

    return { data: single ? (matches[0] ?? null) : matches, error: null };
  }
}

const source = (checkpoint: Record<string, unknown> = {}): GmailSourceRow => ({
  id: "source-1",
  owner_id: "owner-1",
  name: "Gmail",
  config: {},
  checkpoint,
  credentials_ciphertext: "ciphertext",
  credentials_iv: "iv",
  credentials_tag: "tag",
  last_synced_at: null,
});

describe("syncGmailSource lifecycle", () => {
  beforeEach(() => {
    mocks.list.mockReset();
    mocks.process.mockReset();
    mocks.process.mockResolvedValue({ documentId: "document-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("heartbeats before work and advances a durable checkpoint after every message", async () => {
    mocks.list.mockResolvedValue({
      messages: [
        { id: "message-1", threadId: "thread-1" },
        { id: "message-2", threadId: "thread-2" },
      ],
      nextPageToken: "page-2",
    });
    const database = new FakeDatabase();

    const result = await syncGmailSource(database as never, source(), {
      mode: "backfill",
      maxMessages: 2,
    });

    expect(result).toMatchObject({
      status: "partial",
      processed: 2,
      failed: 0,
      hasMore: true,
      pending: 0,
      deadLettered: 0,
    });
    expect(database.runUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          processed_count: 0,
          failed_count: 1,
          error_summary: expect.stringContaining("message-1"),
        }),
        expect.objectContaining({
          processed_count: 1,
          failed_count: 0,
          checkpoint_after: expect.objectContaining({
            pending_message_ids: ["message-2"],
            next_page_token: "page-2",
          }),
        }),
        expect.objectContaining({
          status: "partial",
          processed_count: 2,
          failed_count: 0,
        }),
      ]),
    );
    expect(database.sourceUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkpoint: expect.objectContaining({
            pending_message_ids: ["message-2"],
          }),
        }),
        expect.objectContaining({
          checkpoint: expect.objectContaining({
            pending_message_ids: [],
            next_page_token: "page-2",
            complete: false,
          }),
        }),
      ]),
    );
  });

  it("records and advances past a failed message so one bad email cannot block the source", async () => {
    mocks.list.mockResolvedValue({
      messages: [
        { id: "bad-message", threadId: "thread-1" },
        { id: "good-message", threadId: "thread-2" },
      ],
    });
    mocks.process.mockRejectedValueOnce(new Error("malformed content"));
    const database = new FakeDatabase();

    const result = await syncGmailSource(database as never, source(), {
      mode: "backfill",
      maxMessages: 2,
    });

    expect(result).toMatchObject({
      status: "partial",
      processed: 1,
      failed: 1,
      hasMore: false,
      pending: 0,
      deadLettered: 1,
    });
    const finalRun = database.runs[0];
    expect(finalRun).toMatchObject({
      status: "partial",
      processed_count: 1,
      failed_count: 1,
      checkpoint_after: expect.objectContaining({
        pending_message_ids: [],
        complete: true,
        dead_letter_message_ids: ["bad-message"],
        dead_letter_count: 1,
        dead_letters: {
          "bad-message": expect.objectContaining({
            classification: "permanent",
            reason: "malformed content",
            attempts: 1,
            failed_at: expect.any(String),
          }),
        },
      }),
      error_summary: expect.stringContaining("malformed content"),
    });
  });

  it("retries a transient message once on a later run, then advances after the retry limit", async () => {
    mocks.list.mockResolvedValue({
      messages: [{ id: "transient-message", threadId: "thread-1" }],
    });
    mocks.process
      .mockRejectedValueOnce(new Error("OpenAI request timed out"))
      .mockRejectedValueOnce(
        Object.assign(new Error("OpenAI service unavailable"), { status: 503 }),
      );
    const firstDatabase = new FakeDatabase();

    const firstResult = await syncGmailSource(firstDatabase as never, source(), {
      mode: "backfill",
      maxMessages: 1,
    });
    const retryCheckpoint = firstDatabase.runs[0]
      .checkpoint_after as Record<string, unknown>;

    expect(firstResult).toMatchObject({
      status: "partial",
      processed: 0,
      failed: 1,
      hasMore: true,
    });
    expect(retryCheckpoint).toMatchObject({
      pending_message_ids: ["transient-message"],
      message_attempts: { "transient-message": 1 },
      complete: false,
    });

    const secondDatabase = new FakeDatabase();
    const secondResult = await syncGmailSource(
      secondDatabase as never,
      source(retryCheckpoint),
      { mode: "backfill", maxMessages: 1 },
    );

    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(2);
    expect(secondResult).toMatchObject({
      status: "partial",
      processed: 0,
      failed: 1,
      hasMore: false,
    });
    expect(secondDatabase.runs[0]).toMatchObject({
      checkpoint_after: expect.objectContaining({
        pending_message_ids: [],
        message_attempts: {},
        message_retry_failures: {},
        dead_letter_message_ids: ["transient-message"],
        dead_letter_count: 1,
        dead_letters: {
          "transient-message": expect.objectContaining({
            classification: "retry_exhausted",
            attempts: 2,
            failed_at: expect.any(String),
          }),
        },
        complete: true,
      }),
      error_summary: expect.stringContaining("2/2 caught retries"),
    });
  });

  it("does not advance an ambiguous in-flight message solely because its attempt counter is high", async () => {
    const query = "after:2026-01-10 before:2026-07-10 label:test";
    const database = new FakeDatabase();

    const result = await syncGmailSource(
      database as never,
      source({
        mode: "backfill",
        query,
        cursor_key: query,
        pending_message_ids: ["ambiguous-message"],
        message_attempts: { "ambiguous-message": 2 },
        message_retry_failures: {},
        dead_letter_message_ids: [],
        next_page_token: null,
        complete: false,
        window_start: "2026-01-10",
        window_end: "2026-07-10",
        inflight_message_id: "ambiguous-message",
      }),
      { mode: "backfill", maxMessages: 1 },
    );

    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "completed",
      processed: 1,
      failed: 0,
      hasMore: false,
    });
    expect(database.runs[0]).toMatchObject({
      checkpoint_after: expect.objectContaining({
        pending_message_ids: [],
        dead_letter_message_ids: [],
        complete: true,
      }),
    });
  });

  it("aborts on a systemic authentication failure and keeps the message pending", async () => {
    mocks.list.mockResolvedValue({
      messages: [{ id: "auth-message", threadId: "thread-1" }],
    });
    mocks.process.mockRejectedValueOnce(
      Object.assign(new Error("Invalid API key supplied"), { status: 401 }),
    );
    const database = new FakeDatabase();

    await expect(
      syncGmailSource(database as never, source(), {
        mode: "backfill",
        maxMessages: 1,
      }),
    ).rejects.toThrow(/systemic processing failure/iu);

    const durableProgress = [...database.sourceUpdates]
      .reverse()
      .find((update) => update.checkpoint)?.checkpoint as Record<string, unknown>;
    expect(durableProgress).toMatchObject({
      pending_message_ids: ["auth-message"],
      message_attempts: {},
      dead_letter_message_ids: [],
      complete: false,
    });
    expect(database.runs[0]).toMatchObject({
      status: "failed",
      failed_count: 1,
      checkpoint_after: expect.objectContaining({
        pending_message_ids: ["auth-message"],
      }),
    });
  });

  it("resumes saved pending IDs without listing and preserves the following Gmail page token", async () => {
    const query = "after:2026-01-10 before:2026-07-10 label:test";
    const database = new FakeDatabase();

    const result = await syncGmailSource(
      database as never,
      source({
        mode: "backfill",
        query,
        cursor_key: query,
        pending_message_ids: ["saved-message"],
        next_page_token: "page-after-saved-message",
        complete: false,
        window_start: "2026-01-10",
        window_end: "2026-07-10",
      }),
      { mode: "backfill", maxMessages: 10 },
    );

    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "partial",
      processed: 1,
      hasMore: true,
    });
    expect(database.runs[0]).toMatchObject({
      checkpoint_after: expect.objectContaining({
        pending_message_ids: [],
        next_page_token: "page-after-saved-message",
        complete: false,
      }),
    });
  });

  it("reuses an incomplete incremental query and page token across a date change", async () => {
    const savedQuery =
      'after:2026/07/09 before:2026/07/11 {label:"Newsletters/Business"} -in:spam -in:trash';
    mocks.list.mockResolvedValue({
      messages: [{ id: "next-page-message", threadId: "thread-1" }],
    });
    const database = new FakeDatabase();
    const savedSource = source({
      mode: "incremental",
      query: savedQuery,
      cursor_key: `${savedQuery}|2026-07-09T23:55:00.000Z`,
      pending_message_ids: [],
      message_attempts: {},
      next_page_token: "saved-next-page",
      complete: false,
      window_start: "2026-07-09",
      window_end: "2026-07-10",
    });
    savedSource.last_synced_at = "2026-07-09T23:55:00.000Z";

    const result = await syncGmailSource(database as never, savedSource, {
      mode: "incremental",
      maxMessages: 10,
      windowStart: "2026-07-10",
      windowEnd: "2026-07-11",
    });

    expect(mocks.list).toHaveBeenCalledWith("access-token", {
      query: savedQuery,
      pageToken: "saved-next-page",
      maxResults: 10,
    });
    expect(result).toMatchObject({
      status: "completed",
      processed: 1,
      hasMore: false,
    });
    expect(database.runs[0]).toMatchObject({
      checkpoint_after: expect.objectContaining({
        query: savedQuery,
        next_page_token: null,
        complete: true,
      }),
    });
  });

  it("advances a delayed incremental run only through its frozen anchor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T05:00:00.000Z"));
    mocks.list
      .mockResolvedValueOnce({
        messages: [{ id: "day-D-message", threadId: "thread-1" }],
        nextPageToken: "day-D-page-2",
      })
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({ messages: [] });

    const firstDatabase = new FakeDatabase();
    const firstSource = source();
    firstSource.last_synced_at = "2026-07-09T05:00:00.000Z";
    const firstResult = await syncGmailSource(firstDatabase as never, firstSource, {
      mode: "incremental",
      maxMessages: 25,
    });
    const frozenStore = firstDatabase.sourceUpdates.at(-1)
      ?.checkpoint as Record<string, unknown>;

    expect(firstResult).toMatchObject({ status: "partial", hasMore: true });
    expect(frozenStore).toMatchObject({
      sync_through_at: "2026-07-10T05:00:00.000Z",
      next_page_token: "day-D-page-2",
      complete: false,
    });

    vi.setSystemTime(new Date("2026-07-13T05:00:00.000Z"));
    const secondDatabase = new FakeDatabase();
    const delayedSource = source(frozenStore);
    delayedSource.last_synced_at = "2026-07-09T05:00:00.000Z";
    const secondResult = await syncGmailSource(
      secondDatabase as never,
      delayedSource,
      { mode: "incremental", maxMessages: 25 },
    );
    const completedStore = secondDatabase.sourceUpdates.at(-1)
      ?.checkpoint as Record<string, unknown>;
    const completedSourceUpdate = [...secondDatabase.sourceUpdates]
      .reverse()
      .find((update) => typeof update.last_synced_at === "string");

    expect(secondResult).toMatchObject({ status: "completed", hasMore: false });
    expect(completedSourceUpdate?.last_synced_at).toBe(
      "2026-07-10T05:00:00.000Z",
    );

    const thirdDatabase = new FakeDatabase();
    const nextSource = source(completedStore);
    nextSource.last_synced_at = String(completedSourceUpdate?.last_synced_at);
    await syncGmailSource(thirdDatabase as never, nextSource, {
      mode: "incremental",
      maxMessages: 25,
    });

    expect(mocks.list).toHaveBeenNthCalledWith(3, "access-token", {
      query: expect.stringContaining("after:2026-07-09"),
      pageToken: null,
      maxResults: 25,
    });
    const nextQuery = String(mocks.list.mock.calls[2]?.[1]?.query ?? "");
    expect(nextQuery).toContain("before:2026-07-13");
  });

  it("preserves an unfinished backfill checkpoint when incremental sync runs", async () => {
    const backfillQuery = "after:2026-01-10 before:2026-07-10 label:test";
    const backfillCheckpoint = {
      mode: "backfill",
      query: backfillQuery,
      cursor_key: backfillQuery,
      pending_message_ids: ["backfill-message"],
      message_attempts: { "backfill-message": 1 },
      next_page_token: "backfill-next-page",
      complete: false,
      window_start: "2026-01-10",
      window_end: "2026-07-10",
    };
    mocks.list.mockResolvedValue({ messages: [] });
    const database = new FakeDatabase();

    await syncGmailSource(database as never, source(backfillCheckpoint), {
      mode: "incremental",
      maxMessages: 25,
    });

    const finalSourceCheckpoint = database.sourceUpdates.at(-1)
      ?.checkpoint as Record<string, unknown>;
    expect(finalSourceCheckpoint).toMatchObject({
      version: 2,
      mode: "incremental",
      complete: true,
      modes: {
        backfill: backfillCheckpoint,
        incremental: expect.objectContaining({
          mode: "incremental",
          complete: true,
        }),
      },
    });

    const resumeDatabase = new FakeDatabase();
    const resumeResult = await syncGmailSource(
      resumeDatabase as never,
      source(finalSourceCheckpoint),
      { mode: "backfill", maxMessages: 25 },
    );
    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(resumeResult).toMatchObject({
      status: "partial",
      processed: 1,
      hasMore: true,
    });
    const resumedStore = resumeDatabase.sourceUpdates.at(-1)
      ?.checkpoint as Record<string, unknown>;
    expect(resumedStore).toMatchObject({
      modes: {
        backfill: expect.objectContaining({
          pending_message_ids: [],
          next_page_token: "backfill-next-page",
        }),
        incremental: expect.objectContaining({ complete: true }),
      },
    });
  });

  it("carries dead-letter IDs into a fresh incremental query after completed-query rollover", async () => {
    const priorQuery = "after:2026-07-08 before:2026-07-10 label:test";
    const priorSource = source({
      version: 2,
      mode: "incremental",
      query: priorQuery,
      cursor_key: `${priorQuery}|2026-07-09T05:00:00.000Z`,
      pending_message_ids: [],
      message_attempts: {},
      message_retry_failures: {},
      dead_letter_message_ids: ["dead-letter-A"],
      next_page_token: null,
      complete: true,
      window_start: "2026-07-08",
      window_end: "2026-07-09",
      modes: {
        incremental: {
          mode: "incremental",
          query: priorQuery,
          cursor_key: `${priorQuery}|2026-07-09T05:00:00.000Z`,
          pending_message_ids: [],
          message_attempts: {},
          message_retry_failures: {},
          dead_letter_message_ids: ["dead-letter-A"],
          next_page_token: null,
          complete: true,
          window_start: "2026-07-08",
          window_end: "2026-07-09",
        },
      },
    });
    priorSource.last_synced_at = "2026-07-10T05:00:00.000Z";
    mocks.list.mockResolvedValue({
      messages: [
        { id: "dead-letter-A", threadId: "thread-old" },
        { id: "fresh-message-B", threadId: "thread-new" },
      ],
    });
    const database = new FakeDatabase();

    const rolloverResult = await syncGmailSource(database as never, priorSource, {
      mode: "incremental",
      maxMessages: 25,
    });

    expect(rolloverResult).toMatchObject({ processed: 1, excluded: 1 });
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(mocks.process.mock.calls[0]?.[1]).toMatchObject({
      externalId: "fresh-message-B",
    });

    const rolloverCheckpoint = database.sourceUpdates.at(-1)
      ?.checkpoint as Record<string, unknown>;
    expect(rolloverCheckpoint).toMatchObject({
      mode: "incremental",
      dead_letter_message_ids: ["dead-letter-A"],
      dead_letter_count: 1,
      dead_letters: {
        "dead-letter-A": expect.objectContaining({ classification: "legacy" }),
      },
      modes: {
        incremental: expect.objectContaining({
          dead_letter_message_ids: ["dead-letter-A"],
          complete: true,
        }),
      },
    });
  });

  it("reprocesses and clears a mode's dead letters only when resetCheckpoint is explicit", async () => {
    const query = "after:2026-01-10 before:2026-07-10 label:test";
    const failedAt = "2026-07-10T10:00:00.000Z";
    mocks.list.mockResolvedValue({
      messages: [{ id: "dead-letter-reset", threadId: "thread-1" }],
    });
    const database = new FakeDatabase();

    const result = await syncGmailSource(
      database as never,
      source({
        version: 2,
        mode: "backfill",
        query,
        cursor_key: query,
        pending_message_ids: [],
        message_attempts: {},
        message_retry_failures: {},
        dead_letters: {
          "dead-letter-reset": {
            reason: "malformed content",
            attempts: 1,
            failed_at: failedAt,
            classification: "permanent",
          },
        },
        dead_letter_message_ids: ["dead-letter-reset"],
        dead_letter_count: 1,
        next_page_token: null,
        complete: true,
        window_start: "2026-01-10",
        window_end: "2026-07-10",
        modes: {
          backfill: {
            mode: "backfill",
            query,
            cursor_key: query,
            pending_message_ids: [],
            message_attempts: {},
            message_retry_failures: {},
            dead_letters: {
              "dead-letter-reset": {
                reason: "malformed content",
                attempts: 1,
                failed_at: failedAt,
                classification: "permanent",
              },
            },
            dead_letter_message_ids: ["dead-letter-reset"],
            dead_letter_count: 1,
            next_page_token: null,
            complete: true,
            window_start: "2026-01-10",
            window_end: "2026-07-10",
          },
          incremental: {
            mode: "incremental",
            query: "after:2026-07-09 before:2026-07-11 label:test",
            cursor_key: "incremental-cursor",
            pending_message_ids: ["incremental-pending"],
            message_attempts: {},
            message_retry_failures: {},
            dead_letters: {},
            dead_letter_message_ids: [],
            dead_letter_count: 0,
            next_page_token: "incremental-next-page",
            complete: false,
            window_start: "2026-07-09",
            window_end: "2026-07-10",
          },
        },
      }),
      { mode: "backfill", maxMessages: 25, resetCheckpoint: true },
    );

    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "completed", processed: 1 });
    expect(database.runs[0]).toMatchObject({
      checkpoint_after: expect.objectContaining({
        dead_letters: {},
        dead_letter_message_ids: [],
        dead_letter_count: 0,
      }),
    });
    const resetStore = database.sourceUpdates.at(-1)
      ?.checkpoint as Record<string, unknown>;
    expect(resetStore).toMatchObject({
      modes: {
        backfill: expect.objectContaining({
          dead_letter_count: 0,
          complete: true,
        }),
        incremental: expect.objectContaining({
          pending_message_ids: ["incremental-pending"],
          next_page_token: "incremental-next-page",
        }),
      },
    });
  });

  it("stops before expensive work when the internal completion reserve is unavailable", async () => {
    mocks.list.mockResolvedValue({
      messages: [{ id: "deferred-message", threadId: "thread-1" }],
    });
    const database = new FakeDatabase();

    const result = await syncGmailSource(database as never, source(), {
      mode: "backfill",
      maxMessages: 1,
      timeBudgetMs: 30_000,
    });

    expect(mocks.process).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "partial",
      processed: 0,
      failed: 0,
      stoppedForBudget: true,
      hasMore: true,
      pending: 1,
      deadLettered: 0,
    });
    expect(database.runs[0]).toMatchObject({
      checkpoint_after: expect.objectContaining({
        pending_message_ids: ["deferred-message"],
      }),
    });
  });

  it("rejects a second run while a recent heartbeat owns the source lease", async () => {
    const now = new Date().toISOString();
    const database = new FakeDatabase();
    database.runs.push({
      id: "active-run",
      source_id: "source-1",
      status: "running",
      processed_count: 0,
      failed_count: 1,
      excluded_count: 0,
      error_summary: "Processing a message.",
      heartbeat_at: now,
      started_at: now,
      created_at: now,
    });

    await expect(
      syncGmailSource(database as never, source(), {
        mode: "backfill",
        maxMessages: 1,
      }),
    ).rejects.toBeInstanceOf(GmailSyncInProgressError);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(database.runs).toHaveLength(1);
  });

  it("reconciles an expired zero-count run into a visible failure", async () => {
    const database = new FakeDatabase();
    database.runs.push({
      id: "stale-run",
      source_id: "source-1",
      status: "running",
      processed_count: 0,
      failed_count: 0,
      excluded_count: 0,
      error_summary: null,
      heartbeat_at: "2026-07-10T10:00:00.000Z",
      started_at: "2026-07-10T10:00:00.000Z",
      created_at: "2026-07-10T10:00:00.000Z",
    });

    const result = await reconcileStaleGmailRuns(
      database as never,
      "source-1",
      new Date("2026-07-10T10:07:00.000Z"),
    );

    expect(result).toMatchObject({ reconciledCount: 1, activeRuns: [] });
    expect(database.runs[0]).toMatchObject({
      status: "failed",
      failed_count: 1,
      completed_at: "2026-07-10T10:07:00.000Z",
      error_summary: expect.stringContaining("heartbeat expired"),
    });
  });
});
