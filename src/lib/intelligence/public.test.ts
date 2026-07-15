import { describe, expect, it } from "vitest";
import {
  publicDocumentHref,
  publicIntelligenceExcerpt,
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

  it("blocks private Gmail and newsletter tracking URLs", () => {
    expect(publicOriginalUrl("https://mail.google.com/mail/u/0/#all/123")).toBeNull();
    expect(publicOriginalUrl("https://2f5758e1.click.kit-mail3.com/opaque")).toBeNull();
    expect(publicOriginalUrl("https://openai.com/index/gpt-5-6/")).toBe("https://openai.com/index/gpt-5-6/");
  });
});
