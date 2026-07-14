import { describe, expect, it } from "vitest";
import { parseSignalRefreshLease } from "@/lib/intelligence/signal-refresh-lease";

describe("signal refresh shared lease", () => {
  it("accepts only an explicit successful database claim", () => {
    expect(parseSignalRefreshLease({
      claimed: true,
      holder_run_id: "run-1",
      holder_kind: "local_validation",
      expires_at: "2026-07-14T08:15:00.000Z",
    })).toEqual({
      claimed: true,
      holderRunId: "run-1",
      holderKind: "local_validation",
      expiresAt: "2026-07-14T08:15:00.000Z",
    });
    expect(parseSignalRefreshLease([{
      claimed: false,
      holder_run_id: "run-2",
      holder_kind: "scheduled",
      expires_at: "invalid",
    }])).toEqual({
      claimed: false,
      holderRunId: "run-2",
      holderKind: "scheduled",
      expiresAt: null,
    });
    expect(parseSignalRefreshLease(null).claimed).toBe(false);
  });
});
