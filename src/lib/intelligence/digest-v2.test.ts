import { describe, expect, it } from "vitest";
import {
  digestSignalNarrative,
  digestSignalPassesHistoryGate,
} from "@/lib/intelligence/digest-v2";

const signal = {
  signal_kind: "topic",
  signal_label: "Counter-drone systems",
  direction: "sustained" as const,
  raw_reach: 0,
  supporting_items: 0,
  independent_source_count: 0,
  unique_action_count: 0,
  metadata: {
    has_twelve_complete_weeks: true,
    active_last_four_weeks: 3,
    summary: {
      current_reach: 0.239,
      previous_reach: 0.172,
      current_items: 12,
      sources: 5,
      actions: 2,
    },
  },
};

describe("v2 morning brief selection", () => {
  it("does not call a sustained signal before twelve complete weeks", () => {
    expect(digestSignalPassesHistoryGate(signal)).toBe(true);
    expect(digestSignalPassesHistoryGate({
      ...signal,
      metadata: { ...signal.metadata, has_twelve_complete_weeks: false },
    })).toBe(false);
  });

  it("uses completed research for the explanation and keeps measured context", () => {
    const narrative = digestSignalNarrative(signal, {
      why_now: "An official award changed the evidence this week.",
      why_it_matters: "The programme is entering delivery.",
      what_to_watch: "Watch the first fielding date.",
    });
    expect(narrative.whyNow).toBe("An official award changed the evidence this week.");
    expect(narrative.whyItMatters).toBe("The programme is entering delivery.");
    expect(narrative.whatToWatch).toBe("Watch the first fielding date.");
  });
});
