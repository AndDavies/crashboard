import { describe, expect, it, vi } from "vitest";
import {
  INTELLIGENCE_SEGMENTATION_INPUT_CHARS,
  INTELLIGENCE_SEGMENTATION_MAX_URLS,
  buildNewsletterModelInput,
  refineNewsletterSegments,
  requiresModelSegmentation,
} from "@/lib/intelligence/resegmentation-v2";
import {
  INTELLIGENCE_SEGMENT_PARSER_VERSION,
  buildFallbackSegment,
  segmentNewsletterContent,
} from "@/lib/intelligence/segments";
import type { IntelligenceDocumentEnvelope } from "@/lib/intelligence/types";

const firstArticle =
  "Canada announced a new counter-drone buying programme for deployed forces. The initial phase names the buyer, sets a competitive timetable, and requires field trials before a contract award. Industry teams are expected to demonstrate detection and defeat systems in Halifax this autumn.";
const secondArticle =
  "A NATO agency opened a separate request for information on resilient satellite communications. The notice asks suppliers for production capacity, delivery schedules, and evidence from operational testing. Responses will inform a later multinational procurement decision.";

function envelope(overrides: Partial<IntelligenceDocumentEnvelope> = {}): IntelligenceDocumentEnvelope {
  const contentText = `${firstArticle} ${secondArticle} Unsubscribe Manage your preferences.`;
  return {
    ownerId: "owner-1",
    sourceType: "email_newsletter",
    externalId: "message-1",
    originalUrl: "https://mail.google.com/message-1",
    canonicalUrl: "https://example.com/newsletter",
    title: "Defence morning update",
    contentText,
    segments: [
      buildFallbackSegment({
        title: "Defence morning update",
        contentText,
        canonicalUrl: "https://example.com/newsletter",
        likelyArticles: 3,
      }),
    ],
    metadata: {
      extracted_links: [
        "https://example.com/counter-drone",
        "https://example.com/satcom",
      ],
    },
    ...overrides,
  };
}

describe("newsletter model-assisted re-segmentation", () => {
  it("requires both confidence below 0.70 and multiple likely articles", () => {
    const lowConfidence = buildFallbackSegment({
      contentText: `${firstArticle} ${secondArticle}`,
      likelyArticles: 2,
    });
    expect(requiresModelSegmentation([lowConfidence])).toBe(true);
    expect(requiresModelSegmentation([{ ...lowConfidence, confidence: 0.7 }])).toBe(false);
    expect(requiresModelSegmentation([
      buildFallbackSegment({ contentText: firstArticle, likelyArticles: 1 }),
    ])).toBe(false);
  });

  it("does not call the model when deterministic article segmentation is confident", async () => {
    const segments = segmentNewsletterContent({
      html: `<article><h2>Counter-drone programme</h2><p>${firstArticle}</p><a href="https://example.com/counter-drone">Read more</a></article><article><h2>Satellite communications request</h2><p>${secondArticle}</p><a href="https://example.com/satcom">Read more</a></article>`,
      plainText: `${firstArticle} ${secondArticle}`,
      fallbackTitle: "Defence morning update",
    });
    const modelSegmenter = vi.fn();

    const result = await refineNewsletterSegments(envelope({ segments }), { modelSegmenter });

    expect(result.status).toBe("not_needed");
    expect(result.attempted).toBe(false);
    expect(modelSegmenter).not.toHaveBeenCalled();
    expect(result.segments).toEqual(segments);
  });

  it("replaces a low-confidence multi-article item with grounded editorial segments", async () => {
    const modelSegmenter = vi.fn().mockResolvedValue({
      confidence: 0.88,
      articles: [
        {
          title: "Canada launches counter-drone procurement",
          contentText: firstArticle,
          outboundUrl: "https://example.com/counter-drone",
          confidence: 0.92,
        },
        {
          title: "NATO seeks resilient satellite communications",
          contentText: secondArticle,
          outboundUrl: "https://example.com/satcom",
          confidence: 0.86,
        },
        {
          title: "Sponsored message",
          contentText: "Sponsored partner content presented by Example Systems. ".repeat(4),
          outboundUrl: "https://example.com/sponsor",
          confidence: 0.9,
        },
      ],
    });

    const result = await refineNewsletterSegments(envelope(), {
      model: "test-model",
      modelSegmenter,
    });

    expect(result.status).toBe("completed");
    expect(result.attempted).toBe(true);
    expect(result.segments).toHaveLength(2);
    expect(result.segments.map((segment) => segment.segmentType)).toEqual([
      "editorial",
      "editorial",
    ]);
    expect(result.segments.map((segment) => segment.outboundUrl)).toEqual([
      "https://example.com/counter-drone",
      "https://example.com/satcom",
    ]);
    expect(result.segments.every((segment) =>
      segment.parserVersion === INTELLIGENCE_SEGMENT_PARSER_VERSION &&
      segment.confidence <= 0.88 &&
      segment.exclusionReason === null &&
      segment.metadata.segmentation_method === "model_fallback"
    )).toBe(true);
  });

  it("persists a safely labelled coarse item when the model fails", async () => {
    const result = await refineNewsletterSegments(envelope(), {
      model: "test-model",
      modelSegmenter: vi.fn().mockRejectedValue(new Error("temporary model failure")),
    });

    expect(result.status).toBe("failed");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      segmentType: "unknown",
      confidence: 0.35,
      parserVersion: INTELLIGENCE_SEGMENT_PARSER_VERSION,
      exclusionReason: null,
      metadata: {
        coarse_item: true,
        model_fallback: {
          status: "failed",
          model: "test-model",
          error: "temporary model failure",
        },
      },
    });
  });

  it("bounds newsletter text and URLs before a model request", () => {
    const input = buildNewsletterModelInput(envelope({
      contentText: "Long newsletter sentence. ".repeat(3_000),
      metadata: {
        extracted_links: Array.from(
          { length: 75 },
          (_, index) => `https://example.com/article-${index}`,
        ),
      },
    }));

    expect(input.contentText.length).toBeLessThanOrEqual(INTELLIGENCE_SEGMENTATION_INPUT_CHARS);
    expect(input.allowedUrls).toHaveLength(INTELLIGENCE_SEGMENTATION_MAX_URLS);
  });
});
