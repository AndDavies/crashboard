import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __testables } from "@/lib/intelligence/signal-refresh-v2";

describe("segment-level signal support", () => {
  it("matches punctuation-preserving system and acronym labels at token boundaries", () => {
    expect(__testables.segmentSupportsLabel(
      "Canada selected a new C-UAS system alongside the F-35 programme.",
      "C-UAS",
      null,
    )).toBe(true);
    expect(__testables.segmentSupportsLabel(
      "The F-350 truck was mentioned in an unrelated article.",
      "F-35",
      null,
    )).toBe(false);
  });

  it("uses sufficiently grounded evidence but rejects short ambiguous evidence", () => {
    expect(__testables.segmentSupportsLabel(
      "The department awarded the first production contract this week.",
      "Programme Atlas",
      "awarded the first production contract",
    )).toBe(true);
    expect(__testables.segmentSupportsLabel(
      "A different programme received support.",
      "Programme Atlas",
      "support",
    )).toBe(false);
  });
});
