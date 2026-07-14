import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actionRowsByAnalyticalKey,
  analyticalActionKeyByEventId,
  INTELLIGENCE_EVENT_DEDUP_VERSION,
  isGenericEventTitle,
  loadEventMembershipGeneration,
  parseActiveEventMembershipGeneration,
} from "@/lib/intelligence/event-cluster-memberships";

const activeGeneration = {
  generationId: "generation-current",
  matchVersion: INTELLIGENCE_EVENT_DEDUP_VERSION,
  membershipCount: 2,
  activatedAt: "2026-07-14T12:00:00.000Z",
};

describe("analytical event cluster memberships", () => {
  it("excludes newsletter roundup labels from real-world actions", () => {
    expect(isGenericEventTitle("Weekly defence industry roundup")).toBe(true);
    expect(isGenericEventTitle("Top stories in AI this week")).toBe(true);
    expect(isGenericEventTitle("Canada awards an F-35 training contract")).toBe(false);
  });

  it("counts members of one analytical cluster as one action", () => {
    const keys = analyticalActionKeyByEventId([
      { id: "canonical", cluster_id: "ingestion-a" },
      { id: "duplicate", cluster_id: "ingestion-b" },
      { id: "singleton", cluster_id: "ingestion-c" },
    ], [
      {
        generation_id: "generation-current",
        cluster_id: "analytical",
        event_id: "canonical",
        relationship: "canonical",
        match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
      },
      {
        generation_id: "generation-current",
        cluster_id: "analytical",
        event_id: "duplicate",
        relationship: "member",
        match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
      },
    ], activeGeneration);

    expect(keys).toEqual(new Map([
      ["canonical", "analytical"],
      ["duplicate", "analytical"],
      ["singleton", "ingestion-c"],
    ]));
  });

  it("resolves an analytical action key through its canonical membership", () => {
    const canonical = {
      id: "canonical",
      cluster_id: "ingestion-a",
      title: "Canada awards the LUCAS programme contract",
    };
    const rows = actionRowsByAnalyticalKey(
      ["analytical", "singleton"],
      [canonical, { id: "member", cluster_id: "ingestion-b" }, {
        id: "singleton",
        cluster_id: "ingestion-c",
        title: "A separate action",
      }],
      [{
        generation_id: "generation-current",
        cluster_id: "analytical",
        event_id: "canonical",
        relationship: "canonical",
        match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
      }],
      activeGeneration,
    );

    expect(rows.get("analytical")).toBe(canonical);
    expect(rows.get("singleton")?.title).toBe("A separate action");
  });

  it("ignores stale membership versions and non-canonical evidence members", () => {
    const rows = actionRowsByAnalyticalKey(
      ["stale", "member-only"],
      [{ id: "event", title: "Should not resolve" }],
      [
        {
          generation_id: "generation-stale",
          cluster_id: "stale",
          event_id: "event",
          relationship: "canonical",
          match_version: "event-dedup-v2.1.0",
        },
        {
          generation_id: "generation-current",
          cluster_id: "member-only",
          event_id: "event",
          relationship: "member",
          match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
        },
      ],
      activeGeneration,
    );

    expect(rows.size).toBe(0);
  });

  it("ignores a complete but inactive membership generation", () => {
    const keys = analyticalActionKeyByEventId([
      { id: "event", cluster_id: "ingestion" },
    ], [{
      generation_id: "generation-staged",
      cluster_id: "staged-cluster",
      event_id: "event",
      relationship: "canonical",
      match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
    }], activeGeneration);

    expect(keys.get("event")).toBe("ingestion");
  });

  it("parses only explicit active generation rows", () => {
    expect(parseActiveEventMembershipGeneration({
      generation_id: "generation-current",
      match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
      membership_count: 2,
      activated_at: "2026-07-14T12:00:00.000Z",
    })).toEqual(activeGeneration);
    expect(parseActiveEventMembershipGeneration({ generation_id: "staged" })).toBeNull();
  });

  it("loads a pinned generation by ID even after it is retired", async () => {
    const filters: Array<[string, unknown]> = [];
    const query = {
      select() { return this; },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return this;
      },
      in(column: string, value: unknown[]) {
        filters.push([column, value]);
        return this;
      },
      async maybeSingle() {
        return {
          data: {
            generation_id: "generation-retired",
            match_version: INTELLIGENCE_EVENT_DEDUP_VERSION,
            expected_membership_count: 4,
            activated_at: "2026-07-14T11:00:00.000Z",
          },
          error: null,
        };
      },
    };
    const admin = {
      from(table: string) {
        expect(table).toBe("intelligence_event_dedup_generations");
        return query;
      },
    } as unknown as SupabaseClient;

    await expect(loadEventMembershipGeneration(
      admin,
      "owner",
      "generation-retired",
    )).resolves.toMatchObject({
      generationId: "generation-retired",
      membershipCount: 4,
    });
    expect(filters).toContainEqual(["generation_id", "generation-retired"]);
    expect(filters).toContainEqual(["status", ["active", "retired"]]);
  });
});
