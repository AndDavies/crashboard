import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_SEGMENT_PARSER_VERSION,
  segmentNewsletterContent,
} from "@/lib/intelligence/segments";

describe("newsletter segmentation", () => {
  it("separates editorial stories and excludes tracking links as canonical evidence", () => {
    const segments = segmentNewsletterContent({
      html: `
        <main>
          <article><h2>Canada trials counter-drone system</h2><p>Canadian forces began a multi-week operational trial of a new counter-UAS sensor and interceptor package.</p><a href="https://defence.test/counter-uas-trial?utm_source=newsletter">Read</a></article>
          <article><h2>New satellite contract awarded</h2><p>The agency awarded a production contract for resilient satellite communications terminals for deployed forces.</p><a href="https://space.test/satcom-award">Read</a></article>
          <section><h3>Manage preferences</h3><p>Unsubscribe or manage your preferences and follow us on social media.</p><a href="https://mail.test/unsubscribe/x">Unsubscribe</a></section>
        </main>`,
      plainText: "fallback",
      fallbackTitle: "Daily Brief",
    });

    const editorial = segments.filter((segment) => segment.segmentType === "editorial");
    expect(editorial).toHaveLength(2);
    expect(editorial.map((segment) => segment.title)).toEqual([
      "Canada trials counter-drone system",
      "New satellite contract awarded",
    ]);
    expect(editorial[0]?.outboundUrl).toBe("https://defence.test/counter-uas-trial");
    expect(editorial.every((segment) => segment.parserVersion === INTELLIGENCE_SEGMENT_PARSER_VERSION)).toBe(true);
    expect(new Set(editorial.map((segment) => segment.contentHash)).size).toBe(2);
  });

  it("falls back to one retained segment for plain text", () => {
    const segments = segmentNewsletterContent({
      html: "",
      plainText: "A retained plain-text newsletter about a new procurement.",
      fallbackTitle: "Procurement brief",
      fallbackCanonicalUrl: "https://publisher.test/brief",
    });
    expect(segments).toMatchObject([
      {
        segmentIndex: 0,
        segmentType: "unknown",
        title: "Procurement brief",
        outboundUrl: "https://publisher.test/brief",
        metadata: { fallback: true },
      },
    ]);
  });
});
