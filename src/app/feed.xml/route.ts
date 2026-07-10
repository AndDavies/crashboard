import { getPublishedBlogPosts } from "@/lib/blog/data";
import { SEO_AUTHOR_NAME, SEO_SITE_NAME, absoluteSiteUrl } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

function xmlEscape(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = (await getPublishedBlogPosts()).slice(0, 50);
  const updated = posts[0]?.updatedAt ?? new Date().toISOString();
  const items = posts
    .map((post) => {
      const url = absoluteSiteUrl(`/blog/${post.slug}`);
      const categories = post.tags
        .map((tag) => `<category>${xmlEscape(tag)}</category>`)
        .join("");
      return `<item>
  <title>${xmlEscape(post.title)}</title>
  <link>${xmlEscape(url)}</link>
  <guid isPermaLink="true">${xmlEscape(url)}</guid>
  <pubDate>${new Date(post.publishedAt ?? post.createdAt).toUTCString()}</pubDate>
  <author>${xmlEscape(SEO_AUTHOR_NAME)}</author>
  <description>${xmlEscape(post.excerpt || post.answerSummary)}</description>
  ${categories}
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xmlEscape(`${SEO_SITE_NAME} Blog`)}</title>
  <link>${xmlEscape(absoluteSiteUrl("/blog"))}</link>
  <description>${xmlEscape("Source-backed morning briefs and field notes on AI systems, defence, infrastructure, financial rails, and strategic judgment.")}</description>
  <language>en-ca</language>
  <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
  <atom:link href="${xmlEscape(absoluteSiteUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />
  ${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
