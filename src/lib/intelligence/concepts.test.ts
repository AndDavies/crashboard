import { describe, expect, it } from "vitest";
import {
  canonicalizeExtractedConcept,
  extractCuratedConceptMentions,
  resolveCuratedConcept,
} from "@/lib/intelligence/concepts";

describe("canonical intelligence concepts", () => {
  it("maps aliases to one canonical concept", () => {
    expect(resolveCuratedConcept("C-UAS")?.canonicalLabel).toBe("counter-UAS");
    expect(resolveCuratedConcept("artificial intelligence")?.canonicalLabel).toBe(
      "artificial intelligence",
    );
  });

  it("deduplicates overlapping aliases within one scope", () => {
    const mentions = extractCuratedConceptMentions({
      title: "Counter-UAS procurement",
      contentText: "",
      segments: [
        {
          segmentIndex: 0,
          segmentType: "editorial",
          title: "Counter drone trial",
          contentText: "The C-UAS package defeated drones during the trial.",
          outboundUrl: null,
          urlHost: null,
          contentHash: "hash",
          tokenCount: 9,
          parserVersion: "test",
          confidence: 1,
          metadata: {},
        },
      ],
    });
    const counterUas = mentions.filter(
      (mention) => mention.definition.canonicalLabel === "counter-UAS",
    );
    expect(counterUas.map((mention) => mention.mentionCount)).toEqual([1, 1, 1]);
  });

  it("canonicalizes model labels while retaining model aliases", () => {
    expect(
      canonicalizeExtractedConcept({
        conceptType: "theme",
        canonicalLabel: "counter drone",
        aliases: ["drone defence"],
        domain: "model domain",
        subdomain: "model subdomain",
        confidence: 0.82,
        evidenceText: "A counter-drone system was trialled.",
      }),
    ).toMatchObject({
      conceptType: "capability",
      canonicalLabel: "counter-UAS",
      domain: "Defence",
      subdomain: "air defence",
      aliases: expect.arrayContaining(["counter drone", "drone defence"]),
    });
  });
});
