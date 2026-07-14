import { describe, expect, it } from "vitest";
import {
  assertPaidOpenAiCliConfirmation,
  assertCompatibleLocalOpenAiFlags,
  assertNoOpenAiEmbeddingCoverage,
  disableOpenAiApiForLocalRun,
  PAID_OPENAI_CONFIRMATION_FLAG,
  requestsNoOpenAi,
} from "@/lib/intelligence/local-openai-policy";

const completeCoverage = {
  eligibleSegments: 9_863,
  embeddedSegments: 9_863,
  embeddingsComplete: true,
  concepts: 599,
  embeddedConcepts: 599,
  conceptEmbeddingsComplete: true,
};

describe("local OpenAI policy", () => {
  it("defaults local maintenance to zero API and requires explicit paid opt-in", () => {
    expect(requestsNoOpenAi(["node", "script", "--no-openai"])).toBe(true);
    expect(requestsNoOpenAi(["node", "script", "--codex-review-topics"])).toBe(true);
    expect(requestsNoOpenAi(["node", "script"])).toBe(true);
    expect(requestsNoOpenAi(["node", "script", "--allow-paid-openai"])).toBe(false);
  });

  it("rejects contradictory local API flags", () => {
    expect(() => assertCompatibleLocalOpenAiFlags([
      "node",
      "script",
      "--no-openai",
      "--allow-paid-openai",
    ])).toThrow("cannot be combined");
  });

  it("requires an explicit confirmation before local paid research", () => {
    expect(() => assertPaidOpenAiCliConfirmation([
      "node",
      "scripts/intelligence-research.ts",
    ])).toThrow(PAID_OPENAI_CONFIRMATION_FLAG);
    expect(() => assertPaidOpenAiCliConfirmation([
      "node",
      "scripts/intelligence-research.ts",
      PAID_OPENAI_CONFIRMATION_FLAG,
    ])).not.toThrow();
  });

  it("removes an inherited API key from zero-API local work", () => {
    const environment = {
      OPENAI_API_KEY: "platform-test-value",
      CODEX_API_KEY: "codex-test-value",
      OTHER: "retained",
    };
    disableOpenAiApiForLocalRun(environment);
    expect(environment).toEqual({ OTHER: "retained" });
  });

  it("accepts complete production-compatible embeddings", () => {
    expect(() => assertNoOpenAiEmbeddingCoverage(completeCoverage)).not.toThrow();
  });

  it("fails closed when current segment embeddings are missing", () => {
    expect(() => assertNoOpenAiEmbeddingCoverage({
      ...completeCoverage,
      embeddedSegments: 9_860,
      embeddingsComplete: false,
    })).toThrow("3 current segment embedding(s)");
  });

  it("can check segments alone before the concept phase", () => {
    expect(() => assertNoOpenAiEmbeddingCoverage({
      ...completeCoverage,
      embeddedConcepts: 598,
      conceptEmbeddingsComplete: false,
    }, { requireConcepts: false })).not.toThrow();
  });

  it("fails closed when current concept embeddings are missing", () => {
    expect(() => assertNoOpenAiEmbeddingCoverage({
      ...completeCoverage,
      embeddedConcepts: 597,
      conceptEmbeddingsComplete: false,
    })).toThrow("2 current concept embedding(s)");
  });
});
