import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAndSendIntelligenceDigest } from "@/lib/intelligence/digest";
import { latestCompleteDateKey } from "@/lib/intelligence/signal-metrics";
import { INTELLIGENCE_SIGNAL_METRIC_VERSION } from "@/lib/intelligence/signal-metrics-v2";

const {
  sendGmailMessage,
  getGmailSource,
  gmailAccessTokenForSource,
} = vi.hoisted(() => ({
  sendGmailMessage: vi.fn(),
  getGmailSource: vi.fn(),
  gmailAccessTokenForSource: vi.fn(),
}));

vi.mock("@/lib/intelligence/gmail", () => ({ sendGmailMessage }));
vi.mock("@/lib/intelligence/jobs", () => ({
  getGmailSource,
  gmailAccessTokenForSource,
}));
vi.mock("@/lib/intelligence/research-completions", () => ({
  latestSentIntelligenceDigestAt: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/intelligence/v2-readiness", () => ({
  hasCompletedIntelligenceV2Backfill: vi.fn().mockResolvedValue(true),
  intelligenceSignalsV2Enabled: vi.fn().mockReturnValue(true),
  intelligenceSignalsV2DataState: vi.fn().mockResolvedValue({
    status: "ready",
    latestCompleteDate: "2026-07-12",
    refreshId: "active-refresh",
  }),
}));

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type QueryOperation = {
  method: string;
  args: unknown[];
};

class FakeQuery implements PromiseLike<QueryResult> {
  readonly operations: QueryOperation[] = [];

  constructor(
    readonly table: string,
    private readonly result: QueryResult,
  ) {}

  private chain(method: string, ...args: unknown[]) {
    this.operations.push({ method, args });
    return this;
  }

  select(...args: unknown[]) { return this.chain("select", ...args); }
  eq(...args: unknown[]) { return this.chain("eq", ...args); }
  gt(...args: unknown[]) { return this.chain("gt", ...args); }
  gte(...args: unknown[]) { return this.chain("gte", ...args); }
  lte(...args: unknown[]) { return this.chain("lte", ...args); }
  in(...args: unknown[]) { return this.chain("in", ...args); }
  order(...args: unknown[]) { return this.chain("order", ...args); }
  limit(...args: unknown[]) { return this.chain("limit", ...args); }
  upsert(...args: unknown[]) { return this.chain("upsert", ...args); }
  update(...args: unknown[]) { return this.chain("update", ...args); }

  single() {
    this.operations.push({ method: "single", args: [] });
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeAdmin(signalDate: string) {
  const queries: FakeQuery[] = [];
  let signalQueryCount = 0;
  return {
    queries,
    admin: {
      from(table: string) {
        let result: QueryResult = { data: [], error: null };
        if (table === "intelligence_signal_daily") {
          signalQueryCount += 1;
          result = signalQueryCount === 1
            ? {
                data: [{
                  signal_key: "topic:counter-drone",
                  signal_id: "counter-drone",
                  signal_kind: "topic",
                  signal_label: "Counter-drone systems",
                  direction: "rising",
                  evidence_strength: "moderate",
                  raw_reach: 0.2,
                  supporting_items: 6,
                  unique_stories: 5,
                  independent_source_count: 3,
                  unique_action_count: 1,
                  hidden_rank_score: 0.8,
                  signal_date: signalDate,
                  metadata: {
                    documentIds: [],
                    summary: { current_reach: 0.2, previous_reach: 0.1 },
                  },
                }],
                error: null,
              }
            : {
                data: [{
                  signal_key: "topic:counter-drone",
                  signal_date: signalDate,
                  metadata: { documentIds: [] },
                }],
                error: null,
              };
        } else if (table === "intelligence_digests") {
          result = { data: { id: "digest-id" }, error: null };
        }
        const query = new FakeQuery(table, result);
        queries.push(query);
        return query;
      },
    } as unknown as SupabaseClient,
  };
}

describe("intelligence digest signal query scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGmailSource.mockResolvedValue({ id: "gmail-source" });
    gmailAccessTokenForSource.mockResolvedValue({
      accessToken: "access-token",
      email: "owner@example.com",
    });
    sendGmailMessage.mockResolvedValue({ id: "gmail-message" });
  });

  it("pins both digest signal reads to the canonical metric version", async () => {
    const anchor = new Date("2026-07-13T12:00:00.000Z");
    const { admin, queries } = fakeAdmin(latestCompleteDateKey(anchor));

    await createAndSendIntelligenceDigest(admin, "owner-id", anchor);

    const signalQueries = queries.filter((query) => query.table === "intelligence_signal_daily");
    expect(signalQueries).toHaveLength(2);
    for (const query of signalQueries) {
      expect(query.operations).toContainEqual({
        method: "eq",
        args: ["metric_version", INTELLIGENCE_SIGNAL_METRIC_VERSION],
      });
      expect(query.operations).toContainEqual({
        method: "eq",
        args: ["refresh_id", "active-refresh"],
      });
    }
  });
});
