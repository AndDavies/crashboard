import { describe, expect, it } from "vitest";
import { extractTermObservations } from "@/lib/intelligence/term-observations";

describe("deterministic intelligence term observations", () => {
  it("preserves defence acronyms, model numbers, and exact programme identifiers", () => {
    const result = extractTermObservations({
      title: "PrSM and F-35 C-UAS procurement",
      contentText:
        "The PrSM programme includes F-35 integration. Canada opened solicitation W8486-249999/A for a C-UAS interceptor trial. C-UAS testing will continue.",
    });
    const byNormalized = new Map(result.map((row) => [row.normalizedTerm, row]));

    expect(byNormalized.get("prsm")?.kind).toBe("acronym");
    expect(byNormalized.get("f-35")?.kind).toBe("identifier");
    expect(byNormalized.get("c-uas")?.kind).toBe("acronym");
    expect(byNormalized.get("w8486-249999/a")?.kind).toBe("identifier");
    expect(byNormalized.get("c-uas")?.occurrenceCount).toBe(2);
    expect(byNormalized.get("c-uas")?.titleCount).toBe(1);
  });

  it("caps output and rejects newsletter boilerplate terms", () => {
    const result = extractTermObservations({
      title: "Daily newsletter",
      contentText: "Read this daily newsletter today. Counter-UAS radar procurement is underway.",
      maxTerms: 12,
    });
    expect(result.length).toBeLessThanOrEqual(12);
    expect(result.some((row) => row.normalizedTerm === "newsletter")).toBe(false);
    expect(result.some((row) => row.normalizedTerm.includes("counter-uas"))).toBe(true);
  });

  it("retains meaningful two-letter acronyms", () => {
    const result = extractTermObservations({
      title: "AI procurement",
      contentText: "AI models are being tested for targeting support. AI assurance requirements followed.",
    });
    const ai = result.find((row) => row.normalizedTerm === "ai");
    expect(ai?.kind).toBe("acronym");
    expect(ai?.occurrenceCount).toBe(2);
    expect(ai?.titleCount).toBe(1);
  });
});
