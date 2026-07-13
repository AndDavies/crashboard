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

  it("labels direct footer and registration calls to action without excluding a system story", () => {
    const segments = segmentNewsletterContent({
      html: `
        <main>
          <article><h2>Canada selects F-35 training system</h2><p>The programme completed acceptance testing and will enter service this year. Training deliveries will begin with qualified crews and validated equipment at the main operating base.</p></article>
          <article><h2>Registration opens for defence procurement industry day</h2><p>Suppliers can register now for the buyer's industry day, where officials will explain technical requirements, the competition timetable, and the process for submitting questions.</p></article>
          <section><h3>✉️ Wrapping Up</h3><p>Have questions, comments, or feedback? Just reply directly. We read every response and would love to hear from you about this newsletter and future editions.</p></section>
          <section><h3>DefenseTalks</h3><p>Secure your spot now! Join the annual defence conference for executive discussions, technology demonstrations, networking sessions, and programme updates.</p></section>
        </main>`,
      plainText: "fallback",
      fallbackTitle: "Defence update",
    });

    expect(segments.map((segment) => ({
      title: segment.title,
      type: segment.segmentType,
      reason: segment.exclusionReason,
    }))).toEqual([
      { title: "Canada selects F-35 training system", type: "editorial", reason: null },
      { title: "Registration opens for defence procurement industry day", type: "editorial", reason: null },
      { title: "✉️ Wrapping Up", type: "footer", reason: "footer_boilerplate" },
      { title: "DefenseTalks", type: "sponsored", reason: "sponsored_content" },
    ]);
  });
});
