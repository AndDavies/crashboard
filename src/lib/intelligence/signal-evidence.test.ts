import { describe, expect, it } from "vitest";
import { recentSignalActionReferences } from "@/lib/intelligence/signal-evidence";

describe("signal evidence generation identity", () => {
  it("keeps the generation that produced each stored analytical action ID", () => {
    const rows = new Map<string, Array<{
      metadata: {
        documentIds: string[];
        actionIds: string[];
        eventDedupGenerationId?: string | null;
      };
    }>>([["topic:radar", [
      {
        metadata: {
          documentIds: [],
          actionIds: ["shared-cluster", "old-only"],
          eventDedupGenerationId: "generation-old",
        },
      },
      {
        metadata: {
          documentIds: [],
          actionIds: ["shared-cluster", "new-only"],
          eventDedupGenerationId: "generation-new",
        },
      },
    ]]]);

    expect(recentSignalActionReferences(
      rows,
      ["topic:radar"],
    ).get("topic:radar")).toEqual([
      { actionId: "new-only", eventDedupGenerationId: "generation-new" },
      { actionId: "shared-cluster", eventDedupGenerationId: "generation-new" },
      { actionId: "old-only", eventDedupGenerationId: "generation-old" },
      { actionId: "shared-cluster", eventDedupGenerationId: "generation-old" },
    ]);
  });

  it("marks rows without recorded generation metadata for active-generation fallback", () => {
    const rows = new Map([["keyword:c-uas", [{
      metadata: { documentIds: [], actionIds: ["legacy-action"] },
    }]]]);
    expect(recentSignalActionReferences(rows, ["keyword:c-uas"]))
      .toEqual(new Map([["keyword:c-uas", [{
        actionId: "legacy-action",
        eventDedupGenerationId: null,
      }]]]));
  });
});
