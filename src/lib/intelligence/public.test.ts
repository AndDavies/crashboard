import { describe, expect, it } from "vitest";
import {
  publicDocumentHref,
  publicIntelligenceExcerpt,
  publicIntelligenceTitle,
  publicOriginalUrl,
  publicSignalHref,
} from "./public";

describe("public Intelligence URLs and excerpts", () => {
  it("creates stable, readable trend and article URLs", () => {
    expect(publicSignalHref({ id: "topic:nato", label: "NATO & Allied Defence" }))
      .toMatch(/^\/intelligence\/trends\/nato-allied-defence--[a-f0-9]{8}$/u);
    expect(publicDocumentHref({ id: "doc-1", title: "A New C-UAS Trial" }))
      .toBe("/intelligence/articles/doc-1/a-new-c-uas-trial");
  });

  it("limits public excerpts and removes invisible newsletter spacing", () => {
    expect(publicIntelligenceExcerpt("A\u200B   useful   signal", 100)).toBe("A useful signal");
    const excerpt = publicIntelligenceExcerpt("word ".repeat(300), 100);
    expect(excerpt.length).toBeLessThanOrEqual(100);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("removes presentation-only newsletter chrome without mutating stored content", () => {
    expect(publicIntelligenceExcerpt(
      "A procurement milestone was announced. Sign Up [1] | Advertise [2] | View Online [3] TLDR TOGETHER WITH [Sponsor] The buyer expects proposals in September.",
      500,
    )).toBe("A procurement milestone was announced. The buyer expects proposals in September.");
    expect(publicIntelligenceExcerpt("Update your profile: The system entered trials this week.", 200))
      .toBe("The system entered trials this week.");
    expect(publicIntelligenceExcerpt(
      "View this post on the web at https://example.com/post Feature your business through sponsorship or advertising [ https://example.com/advertise ]. Editor’s Notes: A new contract was announced.",
      500,
    )).toBe("Editor’s Notes: A new contract was announced.");
    expect(publicIntelligenceExcerpt(
      "A weekly roundup. _______________________ Read the full story: https://example.com/story",
      500,
    )).toBe("A weekly roundup. Read the full story:");
    expect(publicIntelligenceExcerpt(
      "A real editorial lead. This message was sent to m.andrew.davies@gmail.com. Manage subscription: unsubscribe",
      500,
    )).toBe("A real editorial lead.");
    expect(publicIntelligenceExcerpt(
      "Lead signal. TLDR AI 2026-07-14 COMBINE AI REASONING WITH DETERMINISTIC EXECUTION (WEBINAR) (SPONSOR) Promotional copy that should not appear. 🚀 HEADLINES & TRENDS A contract was awarded.",
      500,
    )).toBe("Lead signal. 🚀 HEADLINES & TRENDS A contract was awarded.");
    expect(publicIntelligenceExcerpt(
      "A useful headline. View it all online at https://example.com/news Dark Reading is a product of Example Corp.",
      500,
    )).toBe("A useful headline.");
    expect(publicIntelligenceExcerpt(
      "Everything changed …Vd68lgcPW6xYH7h4drcRwW4PSrZH741nBtW5S5BF82cvhhqN6qZ6pBM66d3W4VZD8G5_t6jmVZsm0n6SHg0cW NATO remains central.",
      500,
    )).toBe("Everything changed … NATO remains central.");
    expect(publicIntelligenceTitle("🚀 Fwd: NATO procurement update"))
      .toBe("NATO procurement update");
  });

  it("blocks private Gmail and newsletter tracking URLs", () => {
    expect(publicOriginalUrl("https://mail.google.com/mail/u/0/#all/123")).toBeNull();
    expect(publicOriginalUrl("https://2f5758e1.click.kit-mail3.com/opaque")).toBeNull();
    expect(publicOriginalUrl("https://openai.com/index/gpt-5-6/")).toBe("https://openai.com/index/gpt-5-6/");
  });
});
