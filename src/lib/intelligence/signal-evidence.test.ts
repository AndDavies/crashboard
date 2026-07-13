import { describe, expect, it } from "vitest";
import { recentSignalEvidenceIds } from "@/lib/intelligence/signal-evidence";

describe("signal evidence selection", () => {
  it("retains recent evidence for signals ranked beyond the first 30", () => {
    const keys = Array.from({ length: 35 }, (_, index) => `topic:${index + 1}`);
    const rows = new Map(keys.map((key, index) => [key, Array.from({ length: 20 }, (_, day) => ({
      metadata: {
        documentIds: [`document-${index + 1}-${day + 1}`],
        actionIds: [],
      },
    }))]));

    const selected = recentSignalEvidenceIds(rows, keys, "documentIds", 8);
    expect(selected.get("topic:31")).toHaveLength(8);
    expect(selected.get("topic:31")).toContain("document-31-20");
    expect([...new Set([...selected.values()].flat())]).toHaveLength(35 * 8);
  });
});
