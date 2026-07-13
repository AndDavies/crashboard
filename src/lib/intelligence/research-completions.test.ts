import { describe, expect, it } from "vitest";
import { completedResearchAfter } from "@/lib/intelligence/research-completions";

describe("research completed since the last brief", () => {
  it("uses the exact sent-digest timestamp instead of a rolling-hour approximation", () => {
    const rows = [
      {
        id: "before",
        signal_kind: "topic",
        signal_id: "old",
        what_changed: "Old research.",
        why_it_matters: "Already briefed.",
        evidence_effect: "unchanged",
        created_at: "2026-07-13T06:59:59.999Z",
        intelligence_research_leads: { signal_label: "Old signal" },
      },
      {
        id: "after",
        signal_kind: "system",
        signal_id: "new",
        what_changed: "New evidence arrived.",
        why_it_matters: "It changes the assessment.",
        evidence_effect: "strengthened",
        created_at: "2026-07-13T07:00:00.001Z",
        intelligence_research_leads: [{ signal_label: "New system" }],
      },
    ];

    expect(completedResearchAfter(rows, "2026-07-13T07:00:00.000Z"))
      .toEqual([expect.objectContaining({
        id: "research:after",
        signalLabel: "New system",
        assessmentChange: "strengthened",
        href: "/dashboard/intelligence/explore?signal=system%3Anew",
      })]);
  });
});
