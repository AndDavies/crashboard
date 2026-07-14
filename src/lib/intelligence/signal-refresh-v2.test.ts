import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import {
  __testables,
  refreshSignalsV2Batch,
  releaseSharedSignalRefreshValidationContext,
} from "@/lib/intelligence/signal-refresh-v2";

describe("segment-level signal support", () => {
  it("orders every offset-paginated measurement-context read", () => {
    expect(__testables.contextPageSize).toBe(250);
    const source = readFileSync(
      `${process.cwd()}/src/lib/intelligence/signal-refresh-v2.ts`,
      "utf8",
    );
    const block = source.slice(
      source.indexOf("const loadContextRows = () => Promise.all(["),
      source.indexOf("]) as Promise<SignalRefreshContextRows>;"),
    );
    const pages = block.split(".range(from, to)");
    expect(pages).toHaveLength(18);
    for (const page of pages.slice(0, -1)) {
      const query = page.slice(page.lastIndexOf("fetchPages<DbRow>"));
      expect(query).toContain(".order(");
    }
  });

  it("writes staging rows only inside their immutable refresh identity", () => {
    const source = readFileSync(
      `${process.cwd()}/src/lib/intelligence/signal-refresh-v2.ts`,
      "utf8",
    );
    expect(source).toContain(
      'onConflict: "owner_id,refresh_id,signal_key,signal_date,metric_version"',
    );
    expect(source).toContain(
      'onConflict: "owner_id,refresh_id,metric_version,signal_date"',
    );
    expect(source).not.toContain("completeTermSignalRefresh(");
  });

  it("persists an explicit zero denominator for a stored no-coverage complete day", () => {
    expect(__testables.completeSignalDailyTotals([
      { date: "2026-07-11", items: 22, tokens: 8_000 },
    ], [
      {
        signal_date: "2026-07-11",
        eligible_items: 22,
        eligible_tokens: 8_000,
      },
      {
        signal_date: "2026-07-12",
        eligible_items: 0,
        eligible_tokens: 0,
      },
    ])).toEqual([
      { date: "2026-07-11", items: 22, tokens: 8_000 },
      { date: "2026-07-12", items: 0, tokens: 0 },
    ]);
  });

  it("atomically activates a completed canonical generation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        refresh_id: "refresh",
        metric_version: "signals-v2.1.0",
        start_date: "2025-06-14",
        complete_through: "2026-07-13",
        generation_started_at: "2026-07-14T02:00:00.000Z",
        status: "active",
        promote: true,
        signal_count: 17,
        daily_row_count: 350,
        activated_at: "2026-07-14T02:30:00.000Z",
        retired_at: null,
      },
      error: null,
    });
    const admin = { rpc } as unknown as SupabaseClient;

    await expect(__testables.completeCanonicalSignalGeneration(admin, {
      ownerId: "owner",
      refreshId: "refresh",
      refreshStartedAt: "2026-07-14T02:00:00.000Z",
      startDate: "2025-06-14",
      completeThrough: "2026-07-13",
      finalOrdinal: 15_981,
      promote: true,
    })).resolves.toEqual({
      removedCount: 0,
      hasMore: false,
      signalCount: 17,
      dailyRowCount: 350,
      generationStatus: "active",
    });
    expect(rpc).toHaveBeenCalledWith("complete_intelligence_signal_generation", {
      query_owner: "owner",
      query_refresh_id: "refresh",
      query_metric_version: "signals-v2.1.0",
      query_start: "2025-06-14",
      query_end: "2026-07-13",
      query_generation_started_at: "2026-07-14T02:00:00.000Z",
      query_final_ordinal: 15_981,
      query_promote: true,
      query_event_generation_id: null,
      query_story_generation_id: null,
    });
  });

  it("finalizes a cloned validation generation without promoting it", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          refresh_id: "refresh",
          metric_version: "signals-v2.1.0",
          start_date: "2025-06-14",
          complete_through: "2026-07-13",
          generation_started_at: "2026-07-14T02:00:00.000Z",
          status: "retired",
          promote: false,
          signal_count: 17,
          daily_row_count: 350,
          activated_at: null,
          retired_at: "2026-07-14T02:30:00.000Z",
        },
        error: null,
      }),
    } as unknown as SupabaseClient;

    await expect(__testables.completeCanonicalSignalGeneration(admin, {
      ownerId: "owner",
      refreshId: "refresh",
      refreshStartedAt: "2026-07-14T02:00:00.000Z",
      startDate: "2025-06-14",
      completeThrough: "2026-07-13",
      finalOrdinal: 15_981,
      promote: false,
    })).resolves.toEqual({
      removedCount: 0,
      hasMore: false,
      signalCount: 17,
      dailyRowCount: 350,
      generationStatus: "retired",
    });
  });

  it("resumes an already activated generation without mutating its rows", async () => {
    const from = vi.fn();
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          refresh_id: "refresh",
          metric_version: "signals-v2.1.0",
          start_date: "2025-06-14",
          complete_through: "2026-07-13",
          generation_started_at: "2026-07-14T02:00:00.000Z",
          status: "active",
          promote: true,
          signal_count: 17,
          daily_row_count: 350,
          event_dedup_generation_id: "event-generation",
          story_dedup_generation_id: "story-generation",
          activated_at: "2026-07-14T02:30:00.000Z",
          retired_at: null,
        },
        error: null,
      }),
      from,
    } as unknown as SupabaseClient;
    await expect(refreshSignalsV2Batch(admin, "owner", {
      refreshId: "refresh",
      refreshStartedAt: "2026-07-14T02:00:00.000Z",
      completeThrough: "2026-07-13",
      termCursor: 500,
    })).resolves.toMatchObject({
      hasMore: false,
      signalCount: 17,
      dailyRowCount: 350,
      eventDedupGenerationId: "event-generation",
      storyDedupGenerationId: "story-generation",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("shares one complete validation context across exact-clone target IDs", () => {
    const base = {
      ownerId: "owner-1",
      sharedValidationContextSourceId: "source-refresh-1",
      startDate: "2025-06-13",
      completeThrough: "2026-07-12",
      eventDedupGenerationId: "event-generation-1",
      storyDedupGenerationId: "story-generation-1",
      firstTermBatch: false,
    };
    const first = __testables.signalRefreshContextPlan({
      ...base,
      refreshId: "clone-target-1",
    });
    const second = __testables.signalRefreshContextPlan({
      ...base,
      refreshId: "clone-target-2",
    });

    expect(first.cacheKey).toBe(second.cacheKey);
    expect(first).toMatchObject({
      includeSignalCatalog: true,
      retainAcrossRefreshes: true,
    });
  });

  it("isolates ordinary current-window contexts and all context-defining pins", () => {
    const ordinary = __testables.signalRefreshContextPlan({
      ownerId: "owner-1",
      refreshId: "current-target",
      startDate: "2025-06-14",
      completeThrough: "2026-07-13",
      eventDedupGenerationId: "event-generation-1",
      storyDedupGenerationId: "story-generation-1",
      firstTermBatch: false,
    });
    const shared = __testables.signalRefreshContextPlan({
      ownerId: "owner-1",
      refreshId: "clone-target",
      sharedValidationContextSourceId: "source-refresh-1",
      startDate: "2025-06-13",
      completeThrough: "2026-07-12",
      eventDedupGenerationId: "event-generation-1",
      storyDedupGenerationId: "story-generation-1",
      firstTermBatch: true,
    });

    expect(ordinary).toMatchObject({
      includeSignalCatalog: false,
      retainAcrossRefreshes: false,
    });
    expect(ordinary.cacheKey).not.toBe(shared.cacheKey);
    for (const changed of [
      { sharedValidationContextSourceId: "source-refresh-2" },
      { completeThrough: "2026-07-11" },
      { eventDedupGenerationId: "event-generation-2" },
      { storyDedupGenerationId: "story-generation-2" },
    ]) {
      expect(__testables.signalRefreshContextPlan({
        ownerId: "owner-1",
        refreshId: "clone-target-2",
        sharedValidationContextSourceId: "source-refresh-1",
        startDate: "2025-06-13",
        completeThrough: "2026-07-12",
        eventDedupGenerationId: "event-generation-1",
        storyDedupGenerationId: "story-generation-1",
        firstTermBatch: false,
        ...changed,
      }).cacheKey).not.toBe(shared.cacheKey);
    }
  });

  it("releases only the requested shared validation context", () => {
    const cache = __testables.signalRefreshContextCache as unknown as Map<
      string,
      Promise<unknown>
    >;
    cache.clear();
    cache.set("validation:owner-1:source-1:window-a", Promise.resolve([]));
    cache.set("validation:owner-1:source-1:window-b", Promise.resolve([]));
    cache.set("validation:owner-1:source-2:window-a", Promise.resolve([]));
    cache.set("validation:owner-2:source-1:window-a", Promise.resolve([]));
    cache.set("refresh:owner-1:source-1:window-a", Promise.resolve([]));

    expect(releaseSharedSignalRefreshValidationContext("owner-1", "source-1"))
      .toBe(2);
    expect([...cache.keys()]).toEqual([
      "validation:owner-1:source-2:window-a",
      "validation:owner-2:source-1:window-a",
      "refresh:owner-1:source-1:window-a",
    ]);
    cache.clear();
  });

  it("retains a completed shared clone context but releases an ordinary one", () => {
    expect(__testables.shouldReleaseSignalRefreshContext({
      termBatchHasMore: false,
      retainAcrossRefreshes: true,
    })).toBe(false);
    expect(__testables.shouldReleaseSignalRefreshContext({
      termBatchHasMore: false,
      retainAcrossRefreshes: false,
    })).toBe(true);
    expect(__testables.shouldReleaseSignalRefreshContext({
      termBatchHasMore: true,
      retainAcrossRefreshes: false,
    })).toBe(false);
  });

  it("accepts a shared context only for finalized support cloned to another target", async () => {
    const base = {
      completeThrough: "2026-07-12",
      historyDays: 395,
      refreshId: "clone-target",
      refreshStartedAt: "2026-07-14T02:00:00.000Z",
      termCursor: 0,
      sharedValidationContextSourceId: "source-refresh",
    };
    await expect(refreshSignalsV2Batch({} as SupabaseClient, "owner", {
      ...base,
      refreshId: "source-refresh",
      existingFinalizedTermSupport: true,
    })).rejects.toThrow("source and target refreshes must differ");
    await expect(refreshSignalsV2Batch({} as SupabaseClient, "owner", {
      ...base,
      existingFinalizedTermSupport: false,
    })).rejects.toThrow("already-finalized cloned support snapshot");
  });

  it("enters the first scoring batch only with explicit finalized support", () => {
    expect(__testables.termSignalCursorState(0, true)).toMatchObject({
      signalCursor: 0,
      buildingTermSupport: false,
      finalizingTermSupport: false,
      termCursor: 0,
      firstTermBatch: true,
    });
    expect(__testables.termSignalCursorState(0, false)).toMatchObject({
      buildingTermSupport: true,
      firstTermBatch: false,
    });
    expect(() => __testables.termSignalCursorState(1_000_000, true))
      .toThrow("only enter a signal refresh at cursor 0");
  });

  it("excludes a clear recurring promo only after three documents from one family", () => {
    const candidate = (id: string, documentId: string, sourceFamily = "Defence newsletter") => ({
      id,
      documentId,
      contentHash: "same-promo-hash",
      sourceFamily,
      title: "DefenseTalks | Sep 22, 2026",
      contentText: "Secure your spot now! Emerging technologies are transforming defence operations.",
    });
    expect(__testables.recurringBoilerplateSegmentIds([
      candidate("one", "document-one"),
      candidate("two", "document-two"),
    ])).toEqual(new Set());
    expect(__testables.recurringBoilerplateSegmentIds([
      candidate("one", "document-one"),
      candidate("two", "document-two"),
      candidate("three", "document-three"),
    ])).toEqual(new Set(["one", "two", "three"]));

    const recurringGenericRegistration = ["four", "five", "six"].map((id) => ({
      ...candidate(id, `document-${id}`),
      contentHash: "same-registration-hash",
      title: "Supplier briefing",
      contentText: "Register now for details about the upcoming supplier briefing.",
    }));
    expect(__testables.recurringBoilerplateSegmentIds(recurringGenericRegistration))
      .toEqual(new Set(["four", "five", "six"]));
  });

  it("preserves recurring editorial system coverage and cross-family evidence", () => {
    const legitimate = ["one", "two", "three"].map((id) => ({
      id,
      documentId: `document-${id}`,
      contentHash: "same-system-story",
      sourceFamily: "Defence newsletter",
      title: "Canada selects F-35 training system",
      contentText: "The programme completed acceptance testing and will enter service this year.",
    }));
    expect(__testables.recurringBoilerplateSegmentIds(legitimate)).toEqual(new Set());

    const promoAcrossFamilies = legitimate.map((row, index) => ({
      ...row,
      contentHash: "same-promo",
      sourceFamily: index === 2 ? "Independent publisher" : row.sourceFamily,
      title: "FedTalks",
      contentText: "Register now! Join senior leaders at the annual conference.",
    }));
    expect(__testables.recurringBoilerplateSegmentIds(promoAcrossFamilies)).toEqual(new Set());
  });

  it("matches punctuation-preserving system and acronym labels at token boundaries", () => {
    expect(__testables.segmentSupportsLabel(
      "Canada selected a new C-UAS system alongside the F-35 programme.",
      "C-UAS",
      null,
    )).toBe(true);
    expect(__testables.segmentSupportsLabel(
      "The F-350 truck was mentioned in an unrelated article.",
      "F-35",
      null,
    )).toBe(false);
  });

  it("uses sufficiently grounded evidence but rejects short ambiguous evidence", () => {
    expect(__testables.segmentSupportsLabel(
      "The department awarded the first production contract this week.",
      "Programme Atlas",
      "awarded the first production contract",
    )).toBe(true);
    expect(__testables.segmentSupportsLabel(
      "A different programme received support.",
      "Programme Atlas",
      "support",
    )).toBe(false);
  });

  it("requires event subjects to be supported by measurement evidence documents", () => {
    const measurementDocumentsByEvent = new Map([
      ["event", new Set(["measurement-document"])],
    ]);
    const subjectsByDocument = new Map([
      ["measurement-document", new Set(["measurement-programme"])],
      ["research-document", new Set(["research-programme"])],
    ]);

    expect(__testables.measurementSupportsEventSubject({
      eventId: "event",
      subjectId: "measurement-programme",
      measurementDocumentsByEvent,
      subjectsByDocument,
    })).toBe(true);
    expect(__testables.measurementSupportsEventSubject({
      eventId: "event",
      subjectId: "research-programme",
      measurementDocumentsByEvent,
      subjectsByDocument,
    })).toBe(false);
  });

  it("accepts only measurement-eligible v2 story clusters for scoring", () => {
    expect(__testables.isMeasurementStoryCluster({
      id: "measurement-story",
      cluster_type: "story",
      metadata: {
        dedupe_version: "story-dedup-v2.0.0",
        measurement_eligible: true,
      },
    })).toBe(true);
    expect(__testables.isMeasurementStoryCluster({
      id: "research-story",
      cluster_type: "story",
      metadata: {
        dedupe_version: "story-dedup-v2.0.0",
        measurement_eligible: false,
      },
    })).toBe(false);
    expect(__testables.isMeasurementStoryCluster({
      id: "legacy-duplicate",
      cluster_type: "exact_duplicate",
      metadata: { measurement_eligible: true },
    })).toBe(false);
    expect(__testables.isMeasurementStoryCluster({
      id: "legacy-story",
      cluster_type: "story",
      metadata: { measurement_eligible: true },
    })).toBe(false);
  });

  it("does not count a newsletter roundup as a real-world action", () => {
    const completeThrough = "2026-07-12";
    expect(__testables.validSignalEvent({
      id: "roundup",
      title: "Weekly defence industry roundup",
      event_type: "award",
      announced_at: "2026-07-10T12:00:00.000Z",
      confidence: 0.9,
    }, completeThrough, false)).toBe(false);
    expect(__testables.validSignalEvent({
      id: "award",
      title: "Canada awards an F-35 training contract",
      event_type: "award",
      announced_at: "2026-07-10T12:00:00.000Z",
      confidence: 0.9,
    }, completeThrough, false)).toBe(true);
  });

  it("requires a qualifying principal before counting a procurement action", () => {
    const procurement = {
      id: "procurement",
      title: "Canada opens a counter-drone procurement",
      event_type: "procurement_notice",
      announced_at: "2026-07-10T12:00:00.000Z",
      confidence: 0.9,
    };
    expect(__testables.validSignalEvent(procurement, "2026-07-12", false)).toBe(false);
    expect(__testables.validSignalEvent(procurement, "2026-07-12", true)).toBe(true);
  });

  it("loads exact retired dedup generations for a resumed scoring page", async () => {
    const admin = {
      from(table: string) {
        const filters = new Map<string, unknown>();
        const query = {
          select() { return query; },
          eq(column: string, value: unknown) {
            filters.set(column, value);
            return query;
          },
          in() { return query; },
          async maybeSingle() {
            if (table === "intelligence_event_dedup_generations") {
              return {
                data: filters.get("generation_id") === "event-retired"
                  ? {
                      generation_id: "event-retired",
                      match_version: "event-dedup-v2.2.4",
                      expected_membership_count: 5,
                      activated_at: "2026-07-14T10:00:00.000Z",
                    }
                  : null,
                error: null,
              };
            }
            return {
              data: filters.get("generation_id") === "story-retired"
                ? {
                    generation_id: "story-retired",
                    dedupe_version: "story-dedup-v2.1.0",
                    status: "retired",
                    expected_story_cluster_count: 4,
                    expected_segment_membership_count: 6,
                    expected_document_membership_count: 5,
                    expected_review_cluster_count: 0,
                    expected_review_membership_count: 0,
                    activated_at: "2026-07-14T10:00:00.000Z",
                  }
                : null,
              error: null,
            };
          },
        };
        return query;
      },
    } as unknown as SupabaseClient;

    await expect(__testables.resolveSignalDedupGenerations(admin, "owner", {
      eventDedupGenerationId: "event-retired",
      storyDedupGenerationId: "story-retired",
    }, { allowUnpinned: false })).resolves.toMatchObject({
      eventGeneration: { generationId: "event-retired" },
      storyGeneration: { generationId: "story-retired", status: "retired" },
    });
  });

  it("fails closed when a continuation omitted its generation pins", async () => {
    await expect(__testables.resolveSignalDedupGenerations(
      {} as SupabaseClient,
      "owner",
      {},
      { allowUnpinned: false },
    )).rejects.toThrow("missing its pinned event-dedup generation");
  });
});
