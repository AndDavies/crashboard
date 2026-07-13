import { afterEach, describe, expect, it } from "vitest";
import {
  intelligenceSignalsV2Enabled,
  isCompletedIntelligenceV2BackfillRun,
} from "@/lib/intelligence/v2-readiness";

const originalFlag = process.env.INTELLIGENCE_SIGNALS_V2;

afterEach(() => {
  if (originalFlag === undefined) delete process.env.INTELLIGENCE_SIGNALS_V2;
  else process.env.INTELLIGENCE_SIGNALS_V2 = originalFlag;
});

describe("Intelligence v2 activation gate", () => {
  it("requires an explicit feature flag", () => {
    delete process.env.INTELLIGENCE_SIGNALS_V2;
    expect(intelligenceSignalsV2Enabled()).toBe(false);
    process.env.INTELLIGENCE_SIGNALS_V2 = "true";
    expect(intelligenceSignalsV2Enabled()).toBe(true);
  });

  it("accepts only a completed run at the final v2 checkpoint", () => {
    expect(isCompletedIntelligenceV2BackfillRun({
      status: "completed",
      checkpoint_after: { job: "intelligence_v2", phase: "complete" },
    })).toBe(true);
    expect(isCompletedIntelligenceV2BackfillRun({
      status: "running",
      checkpoint_after: { job: "intelligence_v2", phase: "signals" },
    })).toBe(false);
    expect(isCompletedIntelligenceV2BackfillRun({
      status: "completed",
      checkpoint_after: { job: "legacy_backfill", phase: "complete" },
    })).toBe(false);
  });
});
