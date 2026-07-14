import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = [
  "20260714053160_intelligence_signal_generation_legacy_identity.sql",
  "20260714053170_intelligence_signal_generation_denominator_repair.sql",
  "20260714053180_intelligence_signal_generation_registry_seed.sql",
  "20260714053190_intelligence_signal_generation_constraints.sql",
  "20260714053200_intelligence_signal_generations.sql",
].map((file) => readFileSync(
  new URL(`../../../supabase/migrations/${file}`, import.meta.url),
  "utf8",
)).join("\n");

describe("immutable signal-generation migration", () => {
  it("stores immutable registry identities and one active pointer", () => {
    expect(migration).toContain(
      "create table if not exists public.intelligence_signal_generations",
    );
    expect(migration).toContain(
      "create table if not exists public.intelligence_signal_active_generations",
    );
    expect(migration).toContain(
      "primary key (owner_id, metric_version, refresh_id)",
    );
    expect(migration).toContain(
      "where status = 'active'",
    );
    expect(migration).toContain(
      "unique (owner_id, refresh_id, signal_key, signal_date, metric_version)",
    );
    expect(migration).toContain(
      "primary key (owner_id, refresh_id, metric_version, signal_date)",
    );
  });

  it("repairs only unambiguous legacy zero-day denominators", () => {
    expect(migration).toContain(
      "Legacy signal rows have an ambiguous missing daily denominator.",
    );
    expect(migration).toContain(
      "repair.eligible_items <> repair.max_eligible_items",
    );
    expect(migration).toContain(
      "insert into public.intelligence_signal_daily_totals",
    );
    expect(migration).toContain(
      "create temporary table intelligence_signal_missing_totals_repair",
    );
  });

  it("seeds only a completed non-cloned generation and uses its declared window", () => {
    expect(migration).toContain("run.status = 'completed'");
    expect(migration).toContain(
      "is distinct from 'cloned_backfill_window'",
    );
    expect(migration).toContain(
      "identity.declared_start_date, generation.start_date",
    );
    expect(migration).toMatch(
      /declared_start_date[\s\S]*<= generation\.start_date/u,
    );
    expect(migration).toMatch(
      /declared_complete_through[\s\S]*>= generation\.complete_through/u,
    );
    expect(migration).toContain(
      "No safe completed run could seed an active signal generation.",
    );
  });

  it("begins idempotently and completes under one atomic owner-version lock", () => {
    expect(migration).toContain(
      "create or replace function public.begin_intelligence_signal_generation",
    );
    expect(migration).toContain(
      "create or replace function public.complete_intelligence_signal_generation",
    );
    expect(migration).toContain("on conflict (owner_id, metric_version, refresh_id) do nothing");
    expect(migration).toContain("for update;");
    expect(migration).toContain(":signal-generation");
    expect(migration).toContain("previous.status = 'active'");
    expect(migration).toContain(
      "on conflict (owner_id, metric_version) do update",
    );
  });

  it("fails closed unless term support and every denominator are complete", () => {
    expect(migration).toContain(
      "Signal generation term support still has unprocessed segments.",
    );
    expect(migration).toContain(
      "Signal generation term ordinals are not final and contiguous.",
    );
    expect(migration).toContain(
      "query_final_ordinal <> support_term_count",
    );
    expect(migration).toContain(
      "total.refresh_id = daily.refresh_id",
    );
    expect(migration).toContain(
      "Signal generation daily rows do not match exact persisted denominators.",
    );
  });

  it("retains passed dedup pins and never promotes cloned validation", () => {
    expect(migration).toContain(
      "event_dedup_generation_id = query_event_generation_id",
    );
    expect(migration).toContain(
      "story_dedup_generation_id = query_story_generation_id",
    );
    expect(migration).toContain(
      "A non-promoted validation generation cannot own the active pointer.",
    );
    expect(migration).toContain("status = 'retired'");
    expect(migration).toContain(
      "'event_dedup_generation_id', generation.event_dedup_generation_id",
    );
  });

  it("bounds and makes validation pruning idempotent while refusing production", () => {
    expect(migration).toContain(
      "create or replace function public.prune_intelligence_signal_generation",
    );
    expect(migration).toContain(
      "least(\n    2500,\n    greatest(100, coalesce(query_batch_size, 2500))",
    );
    expect(migration).toContain(
      "generation.status = 'active' or generation.promote = true",
    );
    expect(migration).toContain(
      "Only a finalized retired validation generation can be pruned.",
    );
    expect(migration).toContain("'already_pruned', true");
    expect(migration).toContain("pruned_at = coalesce(compacted.pruned_at");
  });

  it("provides safe bounded ordinary retention for old canonical and abandoned staging rows", () => {
    expect(migration).toContain(
      "create or replace function public.maintain_intelligence_signal_generation_retention",
    );
    expect(migration).toContain("candidate.status <> 'active'");
    expect(migration).toContain("live_run.status in ('running', 'partial')");
    expect(migration).toContain("limit 1");
    expect(migration).toContain("for update skip locked;");
    expect(migration).toContain("candidate.generation_started_at <");
  });

  it("protects only recently live runs, with a bounded local-validation grace period", () => {
    const liveRunPredicates = migration.split(
      "live_run.status in ('running', 'partial')",
    ).length - 1;
    const heartbeatPredicates = migration.split(
      "live_run.heartbeat_at",
    ).length - 1;
    expect(liveRunPredicates).toBe(1);
    expect(heartbeatPredicates).toBe(liveRunPredicates);
    expect(migration).toContain("'intelligence_v2_local_signal_refresh'");
    expect(migration).toContain("in ('cloned_backfill_window', 'current_window')");
    expect(migration).toContain("then interval '7 days'");
    expect(migration).toContain("else interval '24 hours'");
  });

  it("scopes denominator reads and all mutation RPCs to the service role", () => {
    expect(migration).toContain(
      "join active on active.refresh_id = total.refresh_id",
    );
    expect(migration).toContain(
      "join active on active.refresh_id = daily.refresh_id",
    );
    expect(migration).toContain(
      "revoke insert, update, delete on table public.intelligence_signal_daily",
    );
    expect(migration).toContain(
      "revoke all on function public.complete_intelligence_signal_generation",
    );
    expect(migration).toContain(
      "grant execute on function public.maintain_intelligence_signal_generation_retention",
    );
    expect(migration).toContain(
      ") to service_role;",
    );
  });
});
