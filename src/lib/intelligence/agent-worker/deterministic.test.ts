import { describe, expect, it } from "vitest";
import type { IntelligenceStoredDocument } from "@/lib/intelligence/store";
import {
  auditDeterministicSignalQuality,
  buildDeterministicSignals,
} from "./deterministic";

function document(input: {
  id: string;
  date: string;
  source: string;
  title: string;
  content: string;
  story?: string;
}): IntelligenceStoredDocument {
  return {
    id: input.id,
    externalId: input.id,
    sourceType: "email_newsletter",
    sourceFamily: input.source,
    title: input.title,
    publisher: input.source,
    publishedAt: `${input.date}T12:00:00.000Z`,
    canonicalUrl: `https://example.invalid/${input.story ?? input.id}`,
    contentText: input.content,
    contentHash: `hash-${input.story ?? input.id}`,
    editorialTokens: input.content.split(/\s+/u).length,
    segmentationConfidence: 0.92,
    parserVersion: "test.v1",
  };
}

function corpus() {
  const documents: IntelligenceStoredDocument[] = [];
  for (let index = 0; index < 12; index += 1) {
    documents.push(document({
      id: `current-${index}`,
      date: `2026-07-${String(index + 1).padStart(2, "0")}`,
      source: `Current Source ${(index % 4) + 1}`,
      title: `NATO C-UAS procurement trial ${index + 1}`,
      content: "July browser judgment target due. NATO members are funding and testing C-UAS counter-drone systems. The Department of Defense linked the procurement trial to CMMC implementation and deployment milestones.",
      story: `current-story-${Math.floor(index / 2)}`,
    }));
  }
  for (let index = 0; index < 10; index += 1) {
    documents.push(document({
      id: `previous-${index}`,
      date: `2026-06-${String(index + 1).padStart(2, "0")}`,
      source: `Previous Source ${(index % 4) + 1}`,
      title: `Ransomware breach response ${index + 1}`,
      content: "Browser judgment and July appeared in the newsletter footer. A ransomware data breach drove identity security and incident response activity across critical infrastructure.",
    }));
  }
  documents.push(document({
    id: "wrapper",
    date: "2026-07-12",
    source: "Wrapper Source",
    title: "From the Web",
    content: "Subscribe and view this newsletter in your browser. Top news and highly recommended links.",
  }));
  return documents;
}

describe("deterministic Intelligence signal refresh", () => {
  it("returns supported analytical signals instead of generic unigrams", () => {
    const signals = buildDeterministicSignals(corpus());
    const labels = signals.map((signal) => signal.label);

    expect(labels).toContain("Counter-drone defence");
    expect(labels).toContain("NATO");
    expect(labels).toContain("C-UAS");
    expect(labels).toContain("CMMC");
    expect(labels).not.toContain("July");
    expect(labels).not.toContain("Browser");
    expect(labels).not.toContain("Judgment");
    expect(labels).not.toContain("Target");

    const counterDrone = signals.find((signal) => signal.label === "Counter-drone defence")!;
    expect(counterDrone.direction).toBe("new");
    expect(counterDrone.currentItems).toBe(12);
    expect(counterDrone.stories).toBe(6);
    expect(counterDrone.sources).toBe(4);
    expect(counterDrone.actions).toBeGreaterThan(0);
    expect(counterDrone.annotations.length).toBeGreaterThan(0);
    expect(counterDrone.evidence.length).toBeGreaterThan(0);
  });

  it("produces a clean, multi-type corpus audit and excludes wrappers", () => {
    const documents = corpus();
    const signals = buildDeterministicSignals(documents);
    const audit = auditDeterministicSignalQuality(documents, signals);

    expect(audit.blockedLabels).toEqual([]);
    expect(audit.meaningfulRate).toBe(1);
    expect(audit.excludedDocuments).toBe(1);
    expect(audit.kindCounts.topic).toBeGreaterThan(0);
    expect(audit.kindCounts.keyword).toBeGreaterThan(0);
    expect(audit.kindCounts.organization).toBeGreaterThan(0);
    expect(audit.kindCounts.system).toBeGreaterThan(0);
    expect(audit.kindCounts.programme).toBeGreaterThan(0);
  });
});
