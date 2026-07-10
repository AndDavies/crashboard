import { describe, expect, it } from "vitest";
import { prepareBlogArticleHtml } from "@/lib/blog/article-html";

describe("prepareBlogArticleHtml", () => {
  it("adds unique heading anchors and removes a duplicate answer summary", () => {
    const prepared = prepareBlogArticleHtml(
      "<p>Bottom line.</p><h2>Executive Signals</h2><h3>Control & Risk</h3><h3>Control & Risk</h3>",
      { answerSummary: "Bottom line." },
    );

    expect(prepared.html).not.toContain("Bottom line.");
    expect(prepared.html).toContain('id="executive-signals"');
    expect(prepared.html).toContain('id="control-and-risk-2"');
    expect(prepared.headings).toEqual([
      { id: "executive-signals", level: 2, text: "Executive Signals" },
      { id: "control-and-risk", level: 3, text: "Control & Risk" },
      { id: "control-and-risk-2", level: 3, text: "Control & Risk" },
    ]);
  });
});
