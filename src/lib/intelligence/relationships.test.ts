import { describe, expect, it } from "vitest";
import { __testables } from "@/lib/intelligence/relationships";

describe("intelligence relationships", () => {
  it("maps material event types into procurement lifecycle stages", () => {
    expect(__testables.stageForEvent("rfi_rfp_challenge", "open")).toBe("rfi_eoi");
    expect(__testables.stageForEvent("procurement_notice", "announced")).toBe("tender_open");
    expect(__testables.stageForEvent("award", "awarded")).toBe("award");
    expect(__testables.stageForEvent("trial_pilot", "in_trial")).toBe("trial_acceptance");
    expect(__testables.stageForEvent("funding_investment", "announced")).toBeNull();
  });

  it("creates a stable procurement subject without generic action words", () => {
    expect(
      __testables.procurementSubject("Canada awards new contract for Counter-UAS systems"),
    ).toBe("canada awards counter uas");
  });

  it("assigns stronger significance to an above-expectation pair", () => {
    expect(__testables.associationPValue(30, 35, 20, 100)).toBeLessThan(
      __testables.associationPValue(30, 35, 11, 100),
    );
  });
});
