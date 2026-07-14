import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20260714050000_clone_intelligence_term_signal_support_snapshot.sql",
), "utf8");

describe("term-support snapshot clone migration", () => {
  it("keeps clone writes bounded and resumable", () => {
    expect(migration).toContain(
      "create table if not exists public.intelligence_term_signal_support_clones",
    );
    expect(migration).toContain("greatest(100, coalesce(query_batch_size, 1000))");
    expect(migration).toContain("for update;");
    expect(migration).toContain(
      "target does not match its saved resumable cursor",
    );
  });

  it("fails closed unless source support is final and the target is controlled", () => {
    expect(migration).toContain("source snapshot has unprocessed segments");
    expect(migration).toContain("source term ordinals are not final and contiguous");
    expect(migration).toContain(
      "target is non-empty without resumable clone state",
    );
    expect(migration).toContain("target terms are not an exact clone");
  });

  it("exposes the RPC only to the service role under invoker security", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain(
      ") from public, anon, authenticated;",
    );
    expect(migration).toContain(") to service_role;");
  });
});
