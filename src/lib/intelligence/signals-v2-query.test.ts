import { describe, expect, it } from "vitest";
import {
  buildSignalQueryPlan,
  chunkSignalKeys,
  parseStoredSignalSummary,
  type StoredSignalSummary,
} from "./signals-v2-query";

function row(overrides: Record<string, unknown> = {}) {
  return {
    signal_key: "topic:alpha",
    signal_id: "alpha",
    signal_kind: "topic",
    signal_label: "Alpha",
    lens_keys: ["all", "defence"],
    direction: "rising",
    evidence_strength: "strong",
    momentum: 0.04,
    acceleration: 0.01,
    burst: 0.5,
    persistence: 3,
    novelty: 0.2,
    confidence: 0.9,
    increase_probability: 0.98,
    extraction_confidence: 0.8,
    hidden_rank_score: 0.75,
    metadata: {
      has_twelve_complete_weeks: true,
      active_last_four_weeks: 4,
      summary: {
        current_reach: 0.2,
        previous_reach: 0.1,
        current_items: 8,
        previous_items: 4,
        sources: 4,
        stories: 7,
        actions: 2,
        change_points: 10,
      },
    },
    ...overrides,
  };
}

function summary(overrides: Partial<StoredSignalSummary["summary"]> = {}): StoredSignalSummary {
  const parsed = parseStoredSignalSummary(row());
  if (!parsed) throw new Error("Fixture did not parse.");
  return {
    key: overrides.signalKey ?? parsed.key,
    summary: { ...parsed.summary, ...overrides },
  };
}

describe("parseStoredSignalSummary", () => {
  it("restores ranking and classification fields from the complete-day row", () => {
    const parsed = parseStoredSignalSummary(row());
    expect(parsed?.summary).toMatchObject({
      signalKey: "topic:alpha",
      currentReach: 0.2,
      previousReach: 0.1,
      currentItems: 8,
      currentSources: 4,
      direction: "rising",
      evidenceStrength: "strong",
      hiddenRankScore: 0.75,
      hasTwelveCompleteWeeks: true,
    });
  });

  it("rejects a row without its versioned stored summary", () => {
    expect(parseStoredSignalSummary(row({ metadata: {} }))).toBeNull();
  });
});

describe("buildSignalQueryPlan", () => {
  it("loads history only for listed signals and exact comparisons", () => {
    const summaries = [
      summary(),
      summary({ signalKey: "system:bravo", signalId: "bravo", signalLabel: "Bravo", signalKind: "system", hiddenRankScore: 0.6 }),
      summary({ signalKey: "organization:charlie", signalId: "charlie", signalLabel: "Charlie", signalKind: "organization", hiddenRankScore: 0.4 }),
    ];
    const plan = buildSignalQueryPlan({
      summaries,
      lens: "all",
      kind: "all",
      compare: ["charlie"],
      limit: 1,
    });
    expect(plan.selected.map((item) => item.key)).toEqual(["topic:alpha"]);
    expect(plan.compareKeys).toEqual(["organization:charlie"]);
    expect(plan.historyKeys).toEqual(["topic:alpha", "organization:charlie"]);
  });

  it("preserves sustained eligibility, lenses, kinds, and normalized label search", () => {
    const sustained = summary({
      signalKey: "topic:sustain",
      signalId: "sustain",
      signalLabel: "Long Range Fires",
      direction: "sustained",
      currentItems: 5,
      currentReach: 0.25,
      hiddenRankScore: 0.9,
    });
    const notPersistent = summary({
      signalKey: "topic:short",
      signalId: "short",
      signalLabel: "Long Range Noise",
      direction: "sustained",
      currentItems: 5,
      currentReach: 0.3,
      activeLastFourWeeks: 2,
      hiddenRankScore: 1,
    });
    const plan = buildSignalQueryPlan({
      summaries: [sustained, notPersistent],
      lens: "defence",
      kind: "topic",
      query: "  LONG   range ",
      limit: 10,
    });
    expect(plan.filtered.map((item) => item.key)).toEqual(["topic:sustain"]);
  });

  it("caps comparisons at five after resolving stable IDs and labels", () => {
    const summaries = Array.from({ length: 7 }, (_, index) => summary({
      signalKey: `topic:${index}`,
      signalId: String(index),
      signalLabel: `Signal ${index}`,
      hiddenRankScore: 1 - index / 10,
    }));
    const plan = buildSignalQueryPlan({
      summaries,
      lens: "all",
      kind: "all",
      compare: summaries.map((item) => item.summary.signalLabel),
      limit: 1,
    });
    expect(plan.compareKeys).toHaveLength(5);
  });
});

describe("chunkSignalKeys", () => {
  it("keeps bounded history query URLs", () => {
    expect(chunkSignalKeys(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });
});
