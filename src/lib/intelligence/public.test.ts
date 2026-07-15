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
    expect(publicIntelligenceTitle("🚀 Fwd: NATO procurement update"))
      .toBe("NATO procurement update");
  });

  it("blocks private Gmail and newsletter tracking URLs", () => {
    expect(publicOriginalUrl("https://mail.google.com/mail/u/0/#all/123")).toBeNull();
    expect(publicOriginalUrl("https://2f5758e1.click.kit-mail3.com/opaque")).toBeNull();
    expect(publicOriginalUrl("https://openai.com/index/gpt-5-6/")).toBe("https://openai.com/index/gpt-5-6/");
  });
});
