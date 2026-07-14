import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260714062000_intelligence_v2_evaluation_fingerprint_one_pass.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("one-pass Intelligence v2 evaluation fingerprint", () => {
  it("preserves the exact versioned multiset components", () => {
    expect(migration).toContain(
      "create or replace function public.intelligence_v2_evaluation_signal_fingerprint",
    );
    expect(migration).toContain("'fingerprintVersion', 'signal-fingerprint-v2.0.0'");
    expect(migration).toContain("pg_catalog.hashtextextended");
    expect(migration).toContain("pg_catalog.bit_xor");
    expect(migration).toContain("as hash_sum");
    expect(migration).toContain("as min_key_hash");
    expect(migration).toContain("as max_key_hash");
    expect(migration).toContain("'' order by daily.signal_key");
  });

  it("aggregates the immutable refresh once without a historical materialization", () => {
    expect(migration).toContain("with aggregate_values as (");
    expect(migration).toContain("daily.refresh_id = query_refresh_id");
    expect(migration).toContain("daily.metric_version = query_metric_version");
    expect(migration).toContain(
      "daily.signal_date between query_start and query_complete_through",
    );
    expect(migration).not.toContain("pinned as materialized");
    expect(migration).not.toContain("from pinned");
  });

  it("computes complete-day values with filtered aggregates in the same scan", () => {
    expect(migration).toContain("as complete_day_signal_count");
    expect(migration).toContain("as topic_label_count");
    expect(migration).toContain("as topic_label_fingerprint");
    expect(migration).toContain("where daily.signal_date = query_complete_through");
  });

  it("remains read-only, bounded, and service-role-only", () => {
    expect(migration).toContain("language sql");
    expect(migration).toContain("stable");
    expect(migration).toContain("parallel safe");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("set statement_timeout = '60s'");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
