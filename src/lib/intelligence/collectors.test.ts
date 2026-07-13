import { describe, expect, it } from "vitest";
import {
  __testables,
  isRobotsAllowed,
  parseRobotsRules,
} from "@/lib/intelligence/collectors";

describe("intelligence source collectors", () => {
  it("parses RSS and Atom entries into stable discovery records", () => {
    const rss = `<?xml version="1.0"?><rss><channel><title>Official Releases</title><item><guid>release-7</guid><title>System trial announced</title><link>https://example.gov/releases/7</link><pubDate>Mon, 13 Jul 2026 12:00:00 GMT</pubDate><description>Trial details</description></item></channel></rss>`;
    expect(__testables.parseFeed(rss, "https://example.gov/feed.xml")).toEqual([
      expect.objectContaining({
        id: "release-7",
        url: "https://example.gov/releases/7",
        title: "System trial announced",
        publisher: "Official Releases",
        publishedAt: "2026-07-13T12:00:00.000Z",
      }),
    ]);
  });

  it("honors the longest robots rule, including a more specific allow", () => {
    const rules = parseRobotsRules(`
      User-agent: *
      Disallow: /private/
      Allow: /private/releases/
    `);
    expect(isRobotsAllowed(rules, "https://example.gov/private/admin")).toBe(false);
    expect(isRobotsAllowed(rules, "https://example.gov/private/releases/7")).toBe(true);
  });

  it("parses quoted CanadaBuys CSV records with commas and line breaks", () => {
    const csv = `"referenceNumber-numeroReference","title-titre-eng","publicationDate-datePublication"\n"ABC-7","Command, control\nsoftware","2026-07-13"\n`;
    expect(__testables.csvRecords(csv)).toEqual([
      {
        "referenceNumber-numeroReference": "ABC-7",
        "title-titre-eng": "Command, control\nsoftware",
        "publicationDate-datePublication": "2026-07-13",
      },
    ]);
  });

  it("reads canonical sitemap URLs", () => {
    expect(
      __testables.parseSitemap(
        `<urlset><url><loc>/release/1</loc></url><url><loc>https://example.gov/release/2</loc></url></urlset>`,
        "https://example.gov/sitemap.xml",
      ),
    ).toEqual(["https://example.gov/release/1", "https://example.gov/release/2"]);
  });

  it("rejects private-network collection targets", () => {
    expect(__testables.publicFetchUrl("http://127.0.0.1/admin")).toBe(false);
    expect(__testables.publicFetchUrl("http://192.168.1.7/document")).toBe(false);
    expect(__testables.publicFetchUrl("https://open.canada.ca/data")).toBe(true);
  });
});
