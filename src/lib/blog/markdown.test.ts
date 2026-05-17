import { describe, expect, it } from "vitest";
import {
  looksLikeMarkdownContent,
  markdownToBlogHtml,
} from "@/lib/blog/markdown";

describe("blog markdown paste conversion", () => {
  it("detects common markdown content", () => {
    expect(looksLikeMarkdownContent("# Heading")).toBe(true);
    expect(looksLikeMarkdownContent("- one\n- two")).toBe(true);
    expect(looksLikeMarkdownContent("plain paragraph only")).toBe(false);
  });

  it("converts markdown blocks into blog editor html", () => {
    const html = markdownToBlogHtml(`# Title

Intro with **bold text**, _emphasis_, [a link](https://example.com), and \`code\`.

- first
- second

> A useful quote.

\`\`\`
const ok = true;
\`\`\`

---`);

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold text</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">a link</a>',
    );
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<ul><li>first</li><li>second</li></ul>");
    expect(html).toContain("<blockquote><p>A useful quote.</p></blockquote>");
    expect(html).toContain("<pre><code>const ok = true;</code></pre>");
    expect(html).toContain("<hr>");
  });

  it("escapes unsafe html and blocks unsafe urls", () => {
    const html = markdownToBlogHtml(
      `# <script>alert(1)</script>\n\n[bad](javascript:alert(1))`,
    );

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
  });
});
