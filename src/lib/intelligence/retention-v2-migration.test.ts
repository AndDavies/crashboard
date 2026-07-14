import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260714053150_intelligence_v2_bounded_retention.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Intelligence v2 retention migration", () => {
  it("is bounded and keeps every live or canonical validation dependency", () => {
    expect(migration).toContain("limit bounded_batch_size");
    expect(migration).toContain("live_run.status in ('running', 'partial')");
    expect(migration).toContain("canonical_backfill.checkpoint_after ->> 'phase' = 'complete'");
    expect(migration).toContain("candidate.refresh_id in (");
    expect(migration).toContain("clone_state.source_refresh_id");
    expect(migration).toContain("clone_state.target_refresh_id");
  });

  it("does not remove active or signal-referenced dedup generations", () => {
    expect(migration).toContain("generation.status <> 'active'");
    expect(migration).toContain("'story_dedup_generation_id'");
    expect(migration).toContain("'event_dedup_generation_id'");
  });

  it("does not remove an event cluster still referenced by a source event", () => {
    expect(migration).toContain("from public.intelligence_events event_row");
    expect(migration).toContain("event_row.cluster_id = cluster_row.id");
  });

  it("does not let abandoned partial runs block retention forever", () => {
    const liveRunPredicates = migration.split(
      "live_run.status in ('running', 'partial')",
    ).length - 1;
    const heartbeatPredicates = migration.split(
      "live_run.heartbeat_at",
    ).length - 1;
    expect(liveRunPredicates).toBe(5);
    expect(heartbeatPredicates).toBe(liveRunPredicates);
    expect(migration).toContain("'intelligence_v2_local_signal_refresh'");
    expect(migration).toContain("in ('cloned_backfill_window', 'current_window')");
    expect(migration).toContain("then interval '7 days'");
    expect(migration).toContain("else interval '24 hours'");
  });
});
