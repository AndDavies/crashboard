import { describe, expect, it } from "vitest";
import {
  chooseCanonicalSourceUrl,
  extractHttpLinks,
  isTrustworthyContentUrl,
  normalizeSourceUrl,
} from "@/lib/intelligence/source-url";

describe("intelligence source URLs", () => {
  it("unwraps tracked links and removes campaign parameters", () => {
    expect(
      normalizeSourceUrl(
        "https://click.example.net/redirect?url=https%3A%2F%2Fpublisher.test%2Fstory%3Futm_source%3Dmail%26id%3D7",
      ),
    ).toBe("https://publisher.test/story?id=7");
  });

  it("rejects assets, social links, tracking, and unsubscribe links", () => {
    expect(isTrustworthyContentUrl("https://fonts.gstatic.com/font.woff2")).toBe(false);
    expect(isTrustworthyContentUrl("https://linkedin.com/company/example")).toBe(false);
    expect(isTrustworthyContentUrl("https://brief.test/manage-subscription/abc")).toBe(false);
    expect(isTrustworthyContentUrl("https://account.unsubscribe.mailer.test/abc")).toBe(false);
    expect(isTrustworthyContentUrl("https://brief.test/news/contract-award")).toBe(true);
  });

  it("extracts links from HTML and markdown-like parentheses", () => {
    expect(
      extractHttpLinks(
        '<a href="https://brief.test/a?utm_campaign=x">A</a> (https://brief.test/b)',
      ),
    ).toEqual(["https://brief.test/a", "https://brief.test/b"]);
  });

  it("selects the first trustworthy editorial destination", () => {
    expect(
      chooseCanonicalSourceUrl([
        "https://fonts.googleapis.com/css?family=Inter",
        "https://brief.test/unsubscribe/x",
        "https://publisher.test/article/1",
      ]),
    ).toBe("https://publisher.test/article/1");
  });
});
