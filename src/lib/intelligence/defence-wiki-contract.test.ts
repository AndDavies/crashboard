import { describe, expect, it } from "vitest";
import {
  DEFENCE_WIKI_PACKET_VERSION,
  compactText,
  defenceLanguagePattern,
  defenceSourcePacketV1Schema,
  safePublicUrl,
  stablePacketHash,
} from "@/lib/intelligence/defence-wiki-contract";

describe("defence wiki packet contract", () => {
  it("validates a minimal review-first packet", () => {
    const base = {
      schemaVersion: DEFENCE_WIKI_PACKET_VERSION,
      packetId: "crashboard:segment:1",
      sourceSystem: "crashboard" as const,
      sourceRecordIds: ["segment:1"],
      sourceKind: "email_newsletter_segment",
      title: "Canadian naval autonomy update",
      publisher: "Example Defence Brief",
      sourceFamily: "example-defence-brief",
      authorityTier: "specialist" as const,
      canonicalUrl: "https://example.com/naval-autonomy",
      publishedAt: "2026-07-20T00:00:00.000Z",
      capturedAt: "2026-07-20T01:00:00.000Z",
      relevantExcerpt: "A bounded excerpt.",
      summary: null,
      selectionReasons: ["defence_concept" as const],
      defenceRelevanceReason: "Matched the reviewed Maritime Autonomy concept.",
      canadaRelevanceReason: "Names a Canadian programme.",
      concepts: ["Maritime Autonomy"],
      entities: [],
      geography: ["Canada"],
      labels: ["Newsletters/Defence"],
      sourceConfidence: "moderate" as const,
      evidenceRole: "discovery_lead" as const,
      freshness: "current" as const,
      claimRisk: "time_sensitive" as const,
      visibility: "internal" as const,
      reusePolicy: "citation_only" as const,
      needsVerification: true,
      relatedTrueNorthIds: [],
    };
    const packet = { ...base, contentHash: stablePacketHash(base), generatedAt: new Date().toISOString() };
    expect(defenceSourcePacketV1Schema.parse(packet).schemaVersion).toBe(DEFENCE_WIKI_PACKET_VERSION);
  });

  it("never exposes Gmail URLs and bounds copied text", () => {
    expect(safePublicUrl("https://mail.google.com/mail/u/0/#inbox/1")).toBeNull();
    expect(safePublicUrl("https://example.com/source#section")).toBe("https://example.com/source");
    expect(compactText("word ".repeat(1000), 100).length).toBeLessThanOrEqual(100);
    expect(compactText("word ".repeat(1000), 100)).toMatch(/…$/u);
  });

  it("distinguishes national-defence language from generic defensive language", () => {
    expect(defenceLanguagePattern.test("Canada announced a new defence procurement program.")).toBe(true);
    expect(defenceLanguagePattern.test("The navy selected a new sonar system.")).toBe(true);
    expect(defenceLanguagePattern.test("The defense against a software regression is already built.")).toBe(false);
  });
});
