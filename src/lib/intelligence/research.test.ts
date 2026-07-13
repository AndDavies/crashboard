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
});

