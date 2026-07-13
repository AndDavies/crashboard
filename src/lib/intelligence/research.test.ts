import { afterEach, describe, expect, it } from "vitest";
import { __testables } from "@/lib/intelligence/research";

afterEach(() => {
  delete process.env.INTELLIGENCE_RESEARCH_MAX_USD_PER_LEAD;
  delete process.env.OPENAI_INTELLIGENCE_RESEARCH_INPUT_USD_PER_MILLION;
  delete process.env.OPENAI_INTELLIGENCE_RESEARCH_OUTPUT_USD_PER_MILLION;
  delete process.env.OPENAI_INTELLIGENCE_RESEARCH_SEARCH_USD;
});

describe("bounded intelligence research", () => {
  it("retains complete web-search sources and upgrades cited metadata", () => {
    const sources = __testables.responseSources({
      id: "resp_1",
      output_parsed: {},
      output: [
        {
          id: "ws_1",
          type: "web_search_call",
          status: "completed",
          action: {
            type: "search",
            query: "radar award",
            sources: [{ type: "url", url: "https://www.canada.ca/release" }],
          },
        },
        {
          id: "msg_1",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: "Canada announced an award.",
              logprobs: [],
              annotations: [
                {
                  type: "url_citation",
                  start_index: 0,
                  end_index: 28,
                  title: "Government release",
                  url: "https://www.canada.ca/release",
                },
              ],
            },
          ],
        },
      ],
      usage: null,
    } as never);
    expect(sources).toEqual([
      {
        url: "https://www.canada.ca/release",
        title: "Government release",
        citation: true,
      },
    ]);
  });

  it("retains up to five URLs for each web search call", () => {
    const source = (index: number) => ({
      type: "url",
      url: `https://example${index}.com/report`,
    });
    const sources = __testables.responseSources({
      id: "resp_2",
      output_parsed: {},
      output: [
        {
          type: "web_search_call",
          action: { type: "search", query: "official", sources: Array.from({ length: 7 }, (_, index) => source(index)) },
        },
        {
          type: "web_search_call",
          action: { type: "search", query: "independent", sources: Array.from({ length: 7 }, (_, index) => source(index + 7)) },
        },
      ],
      usage: null,
    } as never);
    expect(sources).toHaveLength(10);
    expect(sources.map((item) => item.url)).toContain("https://example11.com/report");
    expect(sources.map((item) => item.url)).not.toContain("https://example6.com/report");
  });

  it("estimates token and search costs and reserves budget before a lead", () => {
    process.env.OPENAI_INTELLIGENCE_RESEARCH_INPUT_USD_PER_MILLION = "2";
    process.env.OPENAI_INTELLIGENCE_RESEARCH_OUTPUT_USD_PER_MILLION = "10";
    process.env.OPENAI_INTELLIGENCE_RESEARCH_SEARCH_USD = "0.01";
    process.env.INTELLIGENCE_RESEARCH_MAX_USD_PER_LEAD = "0.8";
    const cost = __testables.estimatedCost([
      {
        id: "resp_1",
        output_parsed: {},
        output: [{ type: "web_search_call", action: { type: "search", sources: [] } }],
        usage: { input_tokens: 10_000, output_tokens: 2_000 },
      } as never,
    ]);
    expect(cost).toBe(0.05);
    expect(__testables.perLeadBudgetReserveUsd()).toBe(0.8);
  });

  it("recognizes official domains and their subdomains", () => {
    expect(__testables.isPrimaryDomain("canada.ca")).toBe(true);
    expect(__testables.isPrimaryDomain("www.nato.int")).toBe(true);
    expect(__testables.isPrimaryDomain("example.com")).toBe(false);
  });

  it("adds explicitly known programme and company domains to the official pass", () => {
    const lead: Parameters<typeof __testables.officialDomainsForLead>[0] = {
      id: "lead_1",
      owner_id: "owner_1",
      signal_kind: "system",
      signal_id: "system_1",
      signal_label: "Counter-drone system",
      status: "queued",
      trigger_type: "automatic",
      reason: "No primary source.",
      query_context: {
        official_domains: ["https://www.vendor.example/news", "NCIA.NATO.INT", "not a domain"],
      },
      priority: 70,
      attempt_count: 0,
      created_at: "2026-07-13T12:00:00.000Z",
    };
    const domains = __testables.officialDomainsForLead(lead);
    expect(domains).toContain("vendor.example");
    expect(domains).toContain("ncia.nato.int");
    expect(domains).not.toContain("not a domain");
    expect(__testables.isPrimaryDomainForLead(lead, "press.vendor.example")).toBe(true);
  });

  it("allows only Strong New/Rising signals with a material research gap", () => {
    expect(
      __testables.automaticResearchReason({
        direction: "rising",
        evidence_strength: "strong",
        primary_source_count: 0,
        unique_action_count: 0,
        metadata: {},
      })?.reason,
    ).toBe("No primary source. No concrete action evidence. Explanation needs stronger evidence.");
    expect(
      __testables.automaticResearchReason({
        direction: "rising",
        evidence_strength: "strong",
        primary_source_count: 1,
        unique_action_count: 1,
        metadata: { why_now: "A cited award explains the movement." },
      }),
    ).toBeNull();
    expect(
      __testables.automaticResearchReason({
        direction: "new",
        evidence_strength: "moderate",
        primary_source_count: 0,
        unique_action_count: 0,
        metadata: {},
      }),
    ).toBeNull();
  });

  it("enforces the seven-day cooldown from completion time", () => {
    const anchor = new Date("2026-07-13T12:00:00.000Z");
    expect(
      __testables.completedLeadIsCoolingDown(
        {
          created_at: "2026-06-01T12:00:00.000Z",
          completed_at: "2026-07-07T12:00:01.000Z",
          cooldown_until: null,
        },
        anchor,
      ),
    ).toBe(true);
    expect(
      __testables.completedLeadIsCoolingDown(
        {
          created_at: "2026-06-01T12:00:00.000Z",
          completed_at: "2026-07-06T11:59:59.000Z",
          cooldown_until: null,
        },
        anchor,
      ),
    ).toBe(false);
  });

  it("replaces unsupported causal explanations with an explicit unknown", () => {
    const known = new Set(["https://www.canada.ca/release"]);
    expect(
      __testables.verifiedWhyNow(
        {
          text: "A contract award caused the increase.",
          support: "supported",
          sourceUrls: ["https://www.canada.ca/release"],
        },
        known,
      ),
    ).toMatchObject({
      text: "A contract award caused the increase.",
      support: "supported",
    });
    expect(
      __testables.verifiedWhyNow(
        {
          text: "A rumour caused the increase.",
          support: "supported",
          sourceUrls: ["https://unseen.example/claim"],
        },
        known,
      ),
    ).toEqual({
      text: "The available evidence does not establish why this activity changed.",
      support: "unknown",
      sourceUrls: [],
    });
  });
});
