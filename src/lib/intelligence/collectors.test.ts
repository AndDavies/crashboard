import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __testables,
  createSourceAdapter,
  isRobotsAllowed,
  OFFICIAL_SOURCE_SCAFFOLDS,
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
  __testables.resetCollectorState();
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

  it("reads publisher transcript links declared with an alternate Podcasting 2.0 namespace prefix", () => {
    const rss = `<?xml version="1.0"?><rss xmlns:pc="https://podcastindex.org/namespace/1.0"><channel><title>Publisher podcast</title><item><guid>episode-7</guid><title>Programme update</title><link>https://publisher.example/episodes/7</link><pc:transcript url="https://publisher.example/transcripts/7.vtt" type="text/vtt" language="en-CA" rel="captions" /></item></channel></rss>`;
    expect(__testables.parseFeed(rss, "https://publisher.example/feed.xml")[0]).toMatchObject({
      transcripts: [{
        url: "https://publisher.example/transcripts/7.vtt",
        type: "text/vtt",
        language: "en-CA",
        rel: "captions",
      }],
    });
  });

  it("honors Retry-After and makes at most two transient retries", async () => {
    let attempts = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      attempts += 1;
      if (attempts < 3) {
        return new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } });
      }
      return new Response(
        `<rss><channel><item><guid>release-1</guid><link>https://example.gov/releases/1</link></item></channel></rss>`,
        { status: 200, headers: { "Content-Type": "application/rss+xml" } },
      );
    });
    const adapter = createSourceAdapter(source("rss", { feed_url: "https://example.gov/feed.xml" }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    expect(page.externalIds).toEqual(["release-1"]);
    expect(attempts).toBe(3);
  });

  it("rejects a private-network redirect before contacting its target", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "http://127.0.0.1/private" } }),
    );
    const adapter = createSourceAdapter(source("rss", { feed_url: "https://example.gov/feed.xml" }));
    await expect(adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    })).rejects.toThrow("private-network");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("https://example.gov/"))).toBe(true);
  });

  it("rejects an oversized response before reading its declared body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("small test body", {
        status: 200,
        headers: { "Content-Length": "5000001" },
      }),
    );
    const adapter = createSourceAdapter(source("rss", { feed_url: "https://example.gov/feed.xml" }));
    await expect(adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    })).rejects.toThrow("exceeds 5 MB");
  });

  it("uses only a publisher-declared podcast transcript after its own robots check", async () => {
    const requests: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === "https://publisher.example/feed.xml") {
        return new Response(`<?xml version="1.0"?><rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Publisher podcast</title><item><guid>episode-7</guid><title>Programme update</title><link>https://publisher.example/episodes/7</link><podcast:transcript url="https://media.publisher.example/transcripts/7.vtt" type="text/vtt" language="en" /></item></channel></rss>`, { status: 200 });
      }
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /", { status: 200 });
      if (url === "https://publisher.example/episodes/7") {
        return new Response("<html><head><title>Programme update</title></head><body>Episode notes.</body></html>", { status: 200, headers: { "Content-Type": "text/html" } });
      }
      if (url === "https://media.publisher.example/transcripts/7.vtt") {
        return new Response("WEBVTT\n\n00:00.000 --> 00:02.000\nThe system entered operational testing.", { status: 200, headers: { "Content-Type": "text/vtt" } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    const adapter = createSourceAdapter(source("podcast", { feed_url: "https://publisher.example/feed.xml" }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    const document = await adapter.fetch(page.externalIds[0], "owner-1");

    expect(document.contentText).toContain("The system entered operational testing.");
    expect(document.metadata).toMatchObject({
      transcript_status: "downloaded",
      transcript_type: "text/vtt",
      transcript_language: "en",
    });
    expect(requests.indexOf("https://media.publisher.example/robots.txt"))
      .toBeLessThan(requests.indexOf("https://media.publisher.example/transcripts/7.vtt"));
  });

  it("discovers and fetches UK Find a Tender releases through the official OCDS API", async () => {
    let requestedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({
        version: "1.1",
        publisher: { name: "Cabinet Office" },
        links: {
          next: "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?cursor=MTAwM==",
        },
        releases: [{
          id: "012345-2026",
          ocid: "ocds-h6vhtk-0abc12",
          date: "2026-07-12T14:30:00+01:00",
          tag: ["tender"],
          buyer: { id: "GB-PPON-TEST", name: "Defence Equipment Agency" },
          tender: {
            id: "DE-2026-7",
            title: "Counter-UAS system trial",
            description: "Procurement and operational trial of counter-uncrewed-aircraft systems.",
            status: "active",
            procurementMethodDetails: "Competitive flexible procedure",
            mainProcurementCategory: "goods",
            value: { amount: 25000000, currency: "GBP" },
            tenderPeriod: { startDate: "2026-07-12", endDate: "2026-08-15" },
            items: [{
              description: "Counter-UAS equipment",
              classification: { scheme: "CPV", id: "35730000", description: "Electronic warfare systems" },
            }],
            documents: [{
              id: "012345-2026",
              documentType: "tenderNotice",
              noticeType: "UK4",
              url: "https://www.find-tender.service.gov.uk/Notice/012345-2026",
              datePublished: "2026-07-12T14:30:00+01:00",
            }],
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const adapter = createSourceAdapter(source("procurement_portal", {
      adapter: "uk_find_a_tender_ocds",
      api_url: "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages",
    }, "measurement"));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    const document = await adapter.fetch(page.externalIds[0], "owner-1");

    const request = new URL(requestedUrl);
    expect(request.origin + request.pathname).toBe(
      "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages",
    );
    expect(request.searchParams.get("limit")).toBe("25");
    expect(request.searchParams.get("updatedFrom")).toBe("2026-07-01T00:00:00");
    expect(request.searchParams.get("updatedTo")).toBe("2026-07-13T23:59:59");
    expect(page).toMatchObject({
      externalIds: ["012345-2026"],
      nextCheckpoint: { find_tender_cursor: "MTAwM==", has_more: true },
    });
    expect(document).toMatchObject({
      sourceType: "procurement_notice",
      externalId: "012345-2026",
      canonicalUrl: "https://www.find-tender.service.gov.uk/Notice/012345-2026",
      title: "Counter-UAS system trial",
      authorName: "Defence Equipment Agency",
      publisherName: "Cabinet Office",
      publishedAt: "2026-07-12T13:30:00.000Z",
      metadata: {
        source_cohort: "measurement",
        ocid: "ocds-h6vhtk-0abc12",
        notice_id: "012345-2026",
        procurement_reference: "DE-2026-7",
        event_type_hint: "procurement_notice",
        authority: "official",
        api: "find-a-tender-ocds-release-packages-1.0",
      },
    });
    expect(document.contentText).toContain("Counter-UAS equipment");
    expect(document.contentText).toContain("CPV 35730000 Electronic warfare systems");
  });

  it("resumes Find a Tender pagination only with the official cursor contract", async () => {
    let requestedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ version: "1.1", releases: [] }), { status: 200 });
    });
    const adapter = createSourceAdapter(source("procurement_portal", {
      adapter: "uk_find_a_tender_ocds",
    }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
      checkpoint: { find_tender_cursor: "MTAwM==" },
    });
    expect(new URL(requestedUrl).searchParams.get("cursor")).toBe("MTAwM==");
    expect(page.nextCheckpoint).toMatchObject({ find_tender_cursor: null, has_more: false });
  });

  it("rejects non-official endpoints for the Find a Tender adapter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const adapter = createSourceAdapter(source("procurement_portal", {
      adapter: "uk_find_a_tender_ocds",
      api_url: "https://example.com/ocdsReleasePackages",
    }));
    await expect(adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    })).rejects.toThrow("verified official OCDS");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discovers and fetches EU defence notices through the anonymous TED v3 Search API", async () => {
    let requestedUrl = "";
    let requestBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requestedUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        totalNoticeCount: 31,
        iterationNextToken: "next-token-7",
        timedOut: false,
        notices: [{
          "publication-number": "483717-2026",
          "publication-date": "2026-07-13+02:00",
          "notice-title": { eng: "Air-defence radar support" },
          "buyer-name": { eng: ["European Defence Agency"] },
          "notice-type": "cn-standard",
          "notice-subtype": "16",
          "form-type": "competition",
          "procedure-identifier": "procedure-7",
          "description-lot": { eng: ["Support and upgrade of an air-defence radar system."] },
          "main-classification-proc": ["35722000"],
          "buyer-country": ["BEL"],
          "estimated-value-proc": 12000000,
          "estimated-value-cur-proc": "EUR",
          "deadline-receipt-tender-date-lot": ["2026-08-20+02:00"],
          links: {
            html: { ENG: "https://ted.europa.eu/en/notice/-/detail/483717-2026" },
            xml: { MUL: "https://ted.europa.eu/en/notice/483717-2026/xml" },
          },
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const adapter = createSourceAdapter(source("procurement_portal", {
      adapter: "eu_ted_search_v3",
      api_url: "https://api.ted.europa.eu/v3/notices/search",
      expert_query: "main-classification-proc=(35* OR 734* OR 7522*)",
    }, "measurement"));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    });
    const document = await adapter.fetch(page.externalIds[0], "owner-1");

    expect(requestedUrl).toBe("https://api.ted.europa.eu/v3/notices/search");
    expect(requestBody).toMatchObject({
      query: "publication-date>=20260701 AND publication-date<=20260713 AND (main-classification-proc=(35* OR 734* OR 7522*)) SORT BY publication-date",
      limit: 25,
      scope: "ALL",
      paginationMode: "ITERATION",
      onlyLatestVersions: true,
    });
    expect(requestBody.fields).toEqual(expect.arrayContaining([
      "publication-number",
      "publication-date",
      "notice-title",
      "buyer-name",
      "description-lot",
      "main-classification-proc",
      "links",
    ]));
    expect(page).toMatchObject({
      externalIds: ["483717-2026"],
      nextCheckpoint: {
        ted_iteration_token: "next-token-7",
        ted_window_start: "20260701",
        ted_window_end: "20260713",
        has_more: true,
        pagination_mode: "ITERATION",
      },
    });
    expect(document).toMatchObject({
      sourceType: "procurement_notice",
      canonicalUrl: "https://ted.europa.eu/en/notice/-/detail/483717-2026",
      title: "Air-defence radar support",
      authorName: "European Defence Agency",
      publisherName: "Tenders Electronic Daily (TED)",
      language: "en",
      publishedAt: "2026-07-13T00:00:00.000Z",
      metadata: {
        source_cohort: "measurement",
        publication_number: "483717-2026",
        procedure_identifier: "procedure-7",
        main_classification: ["35722000"],
        authority: "official",
        api: "ted-search-api-v3",
      },
    });
    expect(document.contentText).toContain("Support and upgrade of an air-defence radar system.");
    expect(document.contentText).toContain("12000000 EUR");
  });

  it("resumes TED iteration with its fixed query window and opaque token", async () => {
    let requestBody: Record<string, unknown> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ notices: [], iterationNextToken: "unused-token", timedOut: false }), { status: 200 });
    });
    const adapter = createSourceAdapter(source("procurement_portal", {
      adapter: "eu_ted_search_v3",
    }));
    const page = await adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-12T00:00:00.000Z",
      windowEnd: "2026-07-14T23:59:59.999Z",
      checkpoint: {
        ted_iteration_token: "opaque-token-1",
        ted_window_start: "20260701",
        ted_window_end: "20260710",
        ted_expert_query: "main-classification-proc=35*",
      },
    });
    expect(requestBody).toMatchObject({
      query: "publication-date>=20260701 AND publication-date<=20260710 AND (main-classification-proc=35*) SORT BY publication-date",
      iterationNextToken: "opaque-token-1",
      paginationMode: "ITERATION",
    });
    expect(page.nextCheckpoint).toMatchObject({
      ted_iteration_token: null,
      ted_window_start: null,
      ted_window_end: null,
      has_more: false,
    });
  });

  it("rejects non-official endpoints for the TED Search adapter", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const adapter = createSourceAdapter(source("procurement_portal", {
      adapter: "eu_ted_search_v3",
      api_url: "https://example.com/v3/notices/search",
    }));
    await expect(adapter.discover({
      ownerId: "owner-1",
      windowStart: "2026-07-01T00:00:00.000Z",
      windowEnd: "2026-07-13T23:59:59.999Z",
    })).rejects.toThrow("verified official v3 Search API");
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("keeps any unverified procurement entry point inactive", () => {
    expect(() => createSourceAdapter(source("procurement_portal", {
      adapter: "manual_entry_point_only",
      urls: ["https://www.find-tender.service.gov.uk/Search"],
    }))).toThrow("inactive entry-point candidate");
  });

  it("ships representative defence-company press rooms only as prospective candidates", () => {
    const companyKeys = new Set([
      "lockheed-martin-news-releases",
      "bae-systems-newsroom",
      "saab-press-releases",
      "rheinmetall-news",
      "northrop-grumman-newsroom",
    ]);
    const candidates = OFFICIAL_SOURCE_SCAFFOLDS.filter((item) => companyKeys.has(item.externalKey));
    expect(candidates).toHaveLength(companyKeys.size);
    expect(candidates.every((item) =>
      "prospective_measurement" in item.config &&
      item.config.prospective_measurement === true &&
      "requires_manual_approval" in item.config &&
      item.config.requires_manual_approval === true,
    )).toBe(true);
  });

  it("seeds the verified UK and EU procurement adapters as inactive source candidates", () => {
    const findTender = OFFICIAL_SOURCE_SCAFFOLDS.find((item) => item.externalKey === "uk-find-a-tender-ocds");
    const ted = OFFICIAL_SOURCE_SCAFFOLDS.find((item) => item.externalKey === "eu-ted-procurement");
    expect(findTender?.config).toMatchObject({
      adapter: "uk_find_a_tender_ocds",
      api_url: "https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages",
    });
    expect(ted?.config).toMatchObject({
      adapter: "eu_ted_search_v3",
      api_url: "https://api.ted.europa.eu/v3/notices/search",
      expert_query: "main-classification-proc=(35* OR 734* OR 7522*)",
    });
  });

  it("parses both Retry-After seconds and HTTP dates", () => {
    expect(__testables.parseRetryAfter("12", 0)).toBe(12_000);
    expect(__testables.parseRetryAfter("Thu, 01 Jan 1970 00:00:05 GMT", 1_000)).toBe(4_000);
    expect(__testables.parseRetryAfter("invalid", 0)).toBeNull();
  });
});
