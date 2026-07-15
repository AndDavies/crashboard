import { describe, expect, it } from "vitest";
import { IntelligenceResearchOutputSchema } from "./contracts";

function validResearchOutput() {
  return {
    schemaVersion: "crashboard-intelligence-research.v1",
    jobId: "job-1",
    requestId: "00000000-0000-4000-8000-000000000001",
    signalId: "signal-1",
    signalLabel: "C-UAS",
    completedAt: "2026-07-15T12:00:00.000Z",
    whatChanged: "An official buyer confirmed a new procurement milestone.",
    whyNow: "The official milestone explains why coverage increased during the current period.",
    whyItMatters: "The announcement moves the signal from discussion toward funded implementation.",
    whatToWatch: "Watch for the solicitation, award value, delivery schedule, and operational user.",
    assessmentChange: "strengthened",
    evidenceStrength: "strong",
    sources: [
      {
        url: "https://official.example/notice",
        title: "Official procurement notice",
        publisher: "Official buyer",
        publishedAt: "2026-07-15T10:00:00.000Z",
        authority: "official",
        passage: "The buyer confirmed the procurement milestone and delivery requirement.",
        supports: "Confirms the buyer, procurement stage, and timing.",
      },
      {
        url: "https://independent.example/report",
        title: "Independent programme report",
        publisher: "Independent publisher",
        publishedAt: "2026-07-15T11:00:00.000Z",
        authority: "independent",
        passage: "Independent reporting corroborated the official programme milestone.",
        supports: "Corroborates the official announcement and adds context.",
      },
    ],
    unknowns: ["The final award value remains unknown."],
  };
}

describe("Codex research result contract", () => {
  it("accepts structured research with official and independent evidence", () => {
    expect(IntelligenceResearchOutputSchema.parse(validResearchOutput()).sources).toHaveLength(2);
  });

  it("rejects research without an official source", () => {
    const output = validResearchOutput();
    output.sources[0]!.authority = "independent";
    expect(IntelligenceResearchOutputSchema.safeParse(output).success).toBe(false);
  });

  it("rejects duplicate source URLs", () => {
    const output = validResearchOutput();
    output.sources[1]!.url = output.sources[0]!.url;
    expect(IntelligenceResearchOutputSchema.safeParse(output).success).toBe(false);
  });
});
