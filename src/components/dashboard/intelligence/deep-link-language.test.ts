import { describe, expect, it } from "vitest";
import {
  actionLabel,
  contentTypeLabel,
  entityRoleLabel,
  entityTypeLabel,
  evidenceRoleLabel,
  evidenceStrengthLabel,
  isTrendEligibleContent,
  sourceTypeLabel,
  trendItemCountLabel,
} from "@/components/dashboard/intelligence/deep-link-language";

describe("Intelligence deep-link language", () => {
  it("uses the same plain action terms as Overview and Explore", () => {
    expect(actionLabel("procurement_notice")).toBe("Buying opportunity");
    expect(actionLabel("award")).toBe("Contract awarded");
    expect(actionLabel("trial_pilot")).toBe("Being tested");
    expect(actionLabel("deployment")).toBe("Entering use");
    expect(actionLabel("policy_regulation")).toBe("Policy change");
  });

  it("hides unknown internal action and source codes", () => {
    expect(actionLabel("new_internal_event")).toBe("Announcement");
    expect(sourceTypeLabel("private_adapter_v3")).toBe("Source");
    expect(evidenceRoleLabel("model_inferred_role")).toBe("Supporting source");
  });

  it("describes document content without exposing segment terminology", () => {
    expect(contentTypeLabel("editorial")).toBe("Article");
    expect(contentTypeLabel("unknown")).toBe("Full newsletter");
    expect(contentTypeLabel("footer")).toBe("Footer");
    expect(isTrendEligibleContent("editorial")).toBe(true);
    expect(isTrendEligibleContent("unknown")).toBe(true);
    expect(isTrendEligibleContent("sponsored")).toBe(false);
  });

  it("turns entity types and roles into reader-facing labels", () => {
    expect(entityTypeLabel("program")).toBe("Programme");
    expect(entityTypeLabel("product_system")).toBe("System");
    expect(entityTypeLabel("capability_technology")).toBe("System or technology");
    expect(entityRoleLabel("buyer")).toBe("Buyer");
    expect(entityRoleLabel("unmapped_model_role")).toBe("Involved");
  });

  it("shows evidence strength and item counts in the product vocabulary", () => {
    expect(evidenceStrengthLabel(0.8)).toBe("Strong");
    expect(evidenceStrengthLabel(0.6)).toBe("Moderate");
    expect(evidenceStrengthLabel(0.59)).toBe("Early");
    expect(trendItemCountLabel(1)).toBe("1 item used in trends");
    expect(trendItemCountLabel(3)).toBe("3 items used in trends");
  });
});
