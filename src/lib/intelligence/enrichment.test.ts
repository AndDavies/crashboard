import { describe, expect, it } from "vitest";
import { shouldDeeplyEnrich } from "@/lib/intelligence/enrichment";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

function document(contentText: string): IntelligenceDocumentEnvelope {
  return {
    ownerId: "00000000-0000-0000-0000-000000000001",
    sourceType: "email_newsletter",
    externalId: "message-1",
    originalUrl: "https://mail.google.com/message-1",
    title: "Daily update",
    contentText,
  };
}

describe("shouldDeeplyEnrich", () => {
  it("selects procurement, funding, and defence signals", () => {
    expect(
      shouldDeeplyEnrich(document("Canada issued an RFI for a new defence capability.")),
    ).toBe(true);
    expect(shouldDeeplyEnrich(document("The company announced a new funding round."))).toBe(
      true,
    );
  });

  it("does not send routine filler to deep extraction", () => {
    expect(shouldDeeplyEnrich(document("A short collection of productivity links."))).toBe(
      false,
    );
  });
});
