import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260714060000_intelligence_v2_acceptance_snapshot.sql",
    import.meta.url,
  ),
  "utf8",
);

const optimizedMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260714080159_intelligence_v2_acceptance_snapshot_optimized.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Intelligence v2 acceptance snapshot migration", () => {
  it("binds the snapshot to one exact refresh and gives it a bounded runtime path", () => {
    expect(migration).toContain("intelligence_signal_daily_acceptance_refresh_key_idx");
    expect(migration).toMatch(
      /owner_id,\s*refresh_id,\s*metric_version,\s*signal_date,\s*signal_key/u,
    );
    expect(migration).toContain("set statement_timeout = '60s'");
    expect(migration).toContain("daily.refresh_id = params.refresh_id");
  });

  it("fingerprints the full exact series without returning historical rows", () => {
    expect(migration).toContain("intelligence_v2_evaluation_signal_fingerprint");
    expect(migration).toContain("intelligence_signal_daily_evaluation_movement_idx");
    expect(migration).toContain("intelligence_cluster_segments_owner_cluster_segment_idx");
    expect(migration).toContain("intelligence_event_concepts_owner_event_concept_idx");
    expect(migration).toContain("'signalRowCount', full_series.row_count");
    expect(migration).toContain("'completeDaySignalCount', complete_day.row_count");
    expect(migration).toContain("'topicLabelFingerprint', topic_labels.fingerprint");
    expect(migration).toContain("daily.hidden_rank_score");
    expect(migration).toContain("pg_catalog.concat_ws");
    expect(migration).toContain("pg_catalog.hashtextextended");
    expect(migration).toContain("pg_catalog.bit_xor");
    expect(migration).toContain("'fingerprintVersion', 'signal-fingerprint-v2.0.0'");
    expect(migration).not.toContain("pg_catalog.to_jsonb(pinned)");
  });

  it("checks future action evidence without treating every future event as visible", () => {
    expect(migration).toContain("signal_action_ids as materialized");
    expect(migration).toContain("signal.signal_date = params.complete_through");
    expect(migration).toContain("event.id = action.event_id or event.cluster_id = action.event_id");
    expect(migration).toContain("'noFutureVisibleEvents', future.future_events = 0");
  });

  it("checks denominator consistency and all ineligible source cases", () => {
    expect(migration).toContain("count(distinct eligible_items) as item_values");
    expect(migration).toContain("count(distinct eligible_tokens) as token_values");
    expect(migration).toContain("signal.item_values <> 1");
    expect(migration).toContain("signal.token_values <> 1");
    expect(migration).toContain("public.intelligence_signal_daily_totals");
    expect(migration).toContain("signal.eligible_items <> total.eligible_items");
    expect(migration).toContain("document.document_at < document.measurement_active_from");
    expect(migration).toContain("document.source_status <> 'active'");
    expect(migration).toContain("when pg_catalog.cardinality(ids.document_ids) = 0");
    expect(migration).toContain("'researchCohortIsolated', research.affected_signal_rows = 0");
  });

  it("requires every signal row to name the accepted active dedup generations", () => {
    expect(migration).toContain("story_generation_id is distinct from");
    expect(migration).toContain("event_generation_id is distinct from");
    expect(migration).toContain("series.generation_identity_errors");
  });

  it("keeps the RPC read-only and service-role-only", () => {
    expect(migration).toContain("language sql");
    expect(migration).toContain("stable");
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("to service_role");
  });

  it("reapplies the optimized RPC as an explicit production migration", () => {
    expect(optimizedMigration).toContain(
      "create or replace function public.intelligence_v2_acceptance_snapshot",
    );
    expect(optimizedMigration).toContain("daily.refresh_id = params.refresh_id");
    expect(optimizedMigration).toContain("set statement_timeout = '60s'");
    expect(optimizedMigration).toContain("from public, anon, authenticated");
    expect(optimizedMigration).toContain("to service_role");
    expect(optimizedMigration).not.toContain(
      "create or replace function public.intelligence_v2_evaluation_signal_fingerprint",
    );
  });
});
