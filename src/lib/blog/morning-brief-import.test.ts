import { describe, expect, it } from "vitest";
import {
  assertUniqueMorningBriefSlugs,
  transformMorningBriefReport,
  type MorningBriefTransformInput,
} from "@/lib/blog/morning-brief-import";

function fullBrief(overrides: Record<string, unknown> = {}): MorningBriefTransformInput {
  return {
    fileName: "2026-07-02-andrew-s-morning-brief-deployment-becomes-the-market.json",
    markdown: `---
pdf_local_path: /Users/andrewdavies/Documents/Playground/brief.pdf
---

# Andrew's Morning Brief- Deployment Becomes the Market - 2026-07-02`,
    json: {
      report_date: "2026-07-02",
      report_title: "Andrew's Morning Brief- Deployment Becomes the Market",
      subtitle: "Deployment Becomes the Market",
      coverage_window: "July 1-2, 2026",
      bottom_line:
        "The day is less about a single technology breakthrough than a control shift across AI, defence, finance, media, energy, and biotech.",
      executive_signals: [
        {
          heading: "Deployment is becoming a product category",
          detail:
            "Organizations can buy models, but they still struggle to redesign work, data, governance, and handoffs.",
        },
      ],
      grounding_lens: {
        title: "How to Make Smart Decisions Without Getting Lucky",
        source: "Farnam Street",
        url: "https://fs.blog/smart-decisions/",
        core_idea: "Decision quality improves when judgment is treated as a process.",
        challenges: "Outcome bias can make a lucky result look like good process.",
        judgment_value: "The lens slows interpretation down.",
        practice: "Write the observable facts before choosing.",
      },
      articles: [
        {
          theme: "STRATEGY",
          title: "AWS invests $1 billion to embed AI forward deployed engineers",
          source: "Official Source / AWS",
          url: "https://www.aboutamazon.com/news/aws/aws-1-billion-forward-deployed-ai-engineers",
          why_it_stood_out:
            "AWS is turning agentic AI deployment support into a scaled commercial motion.",
          your_action:
            "Watch whether hyperscalers make embedded implementation capacity default.",
          so_what:
            "Enterprise AI spend is moving toward vendors that can absorb integration risk.",
          summary: ["AWS announced a dedicated Forward Deployed Engineering organization."],
        },
        {
          theme: "RISK",
          title: "Midyear assessment says the cyber order is more fragile",
          source: "Center for Cyber Diplomacy",
          url: "https://cybercenter.space/2026/07/01/midyear-assessment-2026/",
          why_it_stood_out: "It treats cyber incidents as institutional evidence.",
          your_action: "Track post-quantum migration and cloud concentration.",
          summary: ["Capability and fragility are rising together."],
        },
      ],
      sector_map: [
        {
          sector: "Enterprise AI deployment",
          signal: "The market is shifting from model access toward implementation.",
          entities: ["AWS Forward Deployed Engineering", "Claude Sonnet"],
          watch_next: "Watch whether customers create standing deployment budgets.",
        },
      ],
      entity_cards: [
        {
          name: "AWS Forward Deployed Engineering",
          role_in_story: "AWS's embedded deployment organization.",
          why_it_matters:
            "It marks a shift from selling cloud capacity to owning implementation.",
          follow_up_questions: ["Will AWS price this as services or consumption acceleration?"],
        },
      ],
      related_links: [
        {
          title: "Anthropic: Introducing Claude Sonnet 5",
          url: "https://www.anthropic.com/news/claude-sonnet-5",
          detail: "Primary model announcement behind the Sonnet signal.",
        },
      ],
      pdf_local_path: "/Users/andrewdavies/Documents/Playground/brief.pdf",
      ...overrides,
    },
  };
}

describe("Morning Brief blog import transform", () => {
  it("converts the current structured report shape into a CMS blog draft", () => {
    const draft = transformMorningBriefReport(fullBrief());

    expect(draft.title).toBe(
      "Deployment Becomes the Market: Morning Brief, July 2, 2026",
    );
    expect(draft.slug).toBe("deployment-becomes-the-market-2026-07-02");
    expect(draft.answerSummary).toContain("control shift");
    expect(draft.sourceLinks).toHaveLength(4);
    expect(draft.tags).toContain("morning brief");
    expect(draft.relatedWikiSlugs).toContain("agentic-engineering");
    expect(draft.contentHtml).toContain("<h2>Executive Signals</h2>");
    expect(draft.contentHtml).toContain("Anchor Articles");
    expect(draft.contentHtml).toContain("Related Links");
    expect(draft.contentJson.type).toBe("doc");
  });

  it("handles the May 8 legacy schema without report_title", () => {
    const draft = transformMorningBriefReport({
      fileName: "2026-05-08-newsletter-signal-report-premium-editorial.json",
      markdown: "# Newsletter Signal Report - Premium Editorial Edition - 2026-05-08",
      json: {
        report_date: "2026-05-08",
        title: "Newsletter Signal Report - Premium Editorial Edition",
        coverage_window: "May 7-8, 2026",
        executive_signals: [
          {
            heading: "Agent workflows need operating metrics",
            detail:
              "Token use, tool calls, context handling, and resumability are management concerns.",
          },
        ],
        articles: [
          {
            theme: "CHANGE",
            title: "Improving token efficiency in GitHub Agentic Workflows",
            source: "GitHub Blog",
            url: "https://github.blog/ai-and-ml/github-copilot/improving-token-efficiency-in-github-agentic-workflows/",
            summary: ["Agentic software is moving toward operating discipline."],
          },
        ],
        related_links: [],
      },
    });

    expect(draft.title).toBe(
      "Newsletter Signal Report: Morning Brief, May 8, 2026",
    );
    expect(draft.slug).toBe("newsletter-signal-report-2026-05-08");
  });

  it("keeps duplicate-day variants distinct through topic plus date slugs", () => {
    const first = transformMorningBriefReport(
      fullBrief({
        report_date: "2026-06-27",
        report_title: "Andrew's Morning Brief- Execution Becomes the Bottleneck",
      }),
    );
    const second = transformMorningBriefReport(
      fullBrief({
        report_date: "2026-06-27",
        report_title: "Andrew's Morning Brief: Operating Models Become the Advantage",
      }),
    );

    expect(first.slug).toBe("execution-becomes-the-bottleneck-2026-06-27");
    expect(second.slug).toBe("operating-models-become-the-advantage-2026-06-27");
    expect(first.slug).not.toBe(second.slug);
  });

  it("synthesizes answer summaries from executive signals when bottom_line is missing", () => {
    const draft = transformMorningBriefReport(fullBrief({ bottom_line: undefined }));

    expect(draft.answerSummary).toContain(
      "Deployment is becoming a product category",
    );
    expect(draft.answerSummary).toContain("Organizations can buy models");
  });

  it("dedupes source links and rejects invalid URLs", () => {
    const deduped = transformMorningBriefReport(
      fullBrief({
        related_links: [
          {
            title: "AWS duplicate",
            url: "https://www.aboutamazon.com/news/aws/aws-1-billion-forward-deployed-ai-engineers",
          },
        ],
      }),
    );

    expect(deduped.sourceLinks).toHaveLength(3);

    expect(() =>
      transformMorningBriefReport(
        fullBrief({
          articles: [
            {
              title: "Bad link",
              source: "Example",
              url: "javascript:alert(1)",
            },
          ],
        }),
      ),
    ).toThrow(/Invalid URL protocol/);
  });

  it("strips local filesystem paths from public blog fields", () => {
    const draft = transformMorningBriefReport(fullBrief());
    const publicText = `${draft.excerpt} ${draft.answerSummary} ${draft.contentHtml}`;

    expect(publicText).not.toContain("/Users/andrewdavies/");
    expect(publicText).not.toContain("pdf_local_path");
  });

  it("detects generated slug collisions before import", () => {
    const draft = transformMorningBriefReport(fullBrief());

    expect(() => assertUniqueMorningBriefSlugs([draft, draft])).toThrow(
      /Duplicate generated slug/,
    );
  });
});
