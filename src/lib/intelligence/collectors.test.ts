import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testables,
  createSourceAdapter,
  isRobotsAllowed,
  parseRobotsRules,
  type CollectionSourceRow,
} from "@/lib/intelligence/collectors";

function source(
  sourceType: CollectionSourceRow["source_type"],
  config: Record<string, unknown>,
  cohort: CollectionSourceRow["cohort"] = "research",
): CollectionSourceRow {
  return {
    id: "source-1",
    owner_id: "owner-1",
    source_type: sourceType,
    name: "Approved source",
    external_key: `${sourceType}-source`,
    status: "active",
    cohort,
    measurement_active_from: cohort === "measurement" ? "2026-07-01T00:00:00.000Z" : null,
    discovery_origin: "manual_approval",
    triggering_research_lead_id: null,
    robots_status: "not_applicable",
    config,
    checkpoint: {},
    last_synced_at: null,
    last_successful_fetch_at: null,
    fetch_failure_count: 0,
    fetch_cooldown_until: null,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

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

  it("uses only the official YouTube API and downloads captions only with explicit OAuth", async () => {
    vi.stubEnv("YOUTUBE_DATA_API_KEY", "test-youtube-key");
    vi.stubEnv("YOUTUBE_OAUTH_ACCESS_TOKEN", "test-youtube-oauth");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/youtube/v3/videos")) {
        return new Response(JSON.stringify({
          items: [{
            id: "abc123XYZ_7",
            snippet: {
              publishedAt: "2026-07-12T12:00:00.000Z",
              channelId: "UCofficial",
              channelTitle: "Official programme channel",
              title: "System trial update",
              description: "A programme update from the publisher.",
              defaultLanguage: "en",
            },
            contentDetails: { caption: "true", duration: "PT8M" },
            status: { privacyStatus: "public" },
          }],
        }), { status: 200 });
      }
      if (url.includes("/youtube/v3/captions?") && init?.headers && String((init.headers as Record<string, string>).Authorization).includes("test-youtube-oauth")) {
        return new Response(JSON.stringify({
          items: [{ id: "caption-en", snippet: { language: "en", trackKind: "standard", isDraft: false } }],
        }), { status: 200 });
      }
      if (url.includes("/youtube/v3/captions/caption-en")) {
        return new Response("WEBVTT\n\n00:00.000 --> 00:02.000\nThe official trial starts this month.", { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const adapter = createSourceAdapter(source("youtube", {
      video_ids: ["abc123XYZ_7"],
      include_captions: true,
    }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    const document = await adapter.fetch(page.externalIds[0], "owner-1");

    expect(page.externalIds).toEqual(["abc123XYZ_7"]);
    expect(document.sourceType).toBe("youtube_video");
    expect(document.contentText).toContain("The official trial starts this month.");
    expect(document.metadata).toMatchObject({
      source_cohort: "research",
      caption_status: "downloaded",
      api: "youtube-data-api-v3",
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("youtube-transcript"))).toBe(false);
  });

  it("collects Reddit posts through approved OAuth and keeps them as community research evidence", async () => {
    vi.stubEnv("REDDIT_CLIENT_ID", "reddit-client");
    vi.stubEnv("REDDIT_CLIENT_SECRET", "reddit-secret");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/v1/access_token")) {
        return new Response(JSON.stringify({ access_token: "reddit-access" }), { status: 200 });
      }
      if (url.includes("oauth.reddit.com/r/CanadianForces/new")) {
        return new Response(JSON.stringify({
          data: {
            after: null,
            children: [{ data: {
              id: "post7",
              name: "t3_post7",
              title: "Programme request discussed",
              selftext: "Community discussion referencing a new request.",
              author: "analyst",
              subreddit: "CanadianForces",
              permalink: "/r/CanadianForces/comments/post7/programme_request/",
              created_utc: 1783857600,
            } }],
          },
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const adapter = createSourceAdapter(source("reddit", { subreddit: "CanadianForces" }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    const document = await adapter.fetch(page.externalIds[0], "owner-1");

    expect(document.sourceType).toBe("reddit_post");
    expect(document.publisherName).toBe("r/CanadianForces");
    expect(document.metadata).toMatchObject({
      source_cohort: "research",
      authority: "community",
      api: "reddit-oauth-api",
    });
  });

  it("collects approved X user timelines through API v2 without webpage scraping", async () => {
    vi.stubEnv("X_API_BEARER_TOKEN", "x-bearer");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("api.x.com/2/users/12345/tweets")) {
        return new Response(JSON.stringify({
          data: [{
            id: "998877",
            text: "Official programme milestone announced.",
            author_id: "12345",
            created_at: "2026-07-12T12:00:00.000Z",
            lang: "en",
          }],
          meta: {},
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const adapter = createSourceAdapter(source("social", {
      adapter: "x_api_v2",
      x_user_id: "12345",
      x_username: "ProgrammeOffice",
    }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    const document = await adapter.fetch(page.externalIds[0], "owner-1");

    expect(document.sourceType).toBe("social_post");
    expect(document.canonicalUrl).toBe("https://x.com/ProgrammeOffice/status/998877");
    expect(document.metadata).toMatchObject({ authority: "community", api: "x-api-v2" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
