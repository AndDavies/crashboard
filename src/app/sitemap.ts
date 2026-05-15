import type { MetadataRoute } from "next";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { absoluteSiteUrl } from "@/lib/seo/metadata";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, wikiIndex] = await Promise.all([
    getPublishedBlogPosts(),
    Promise.resolve(getPublicWikiIndex()),
  ]);

  const now = new Date();
  const wikiGeneratedAt = new Date(wikiIndex.generatedAt);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteSiteUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/blog"),
      lastModified: posts[0]?.updatedAt ? new Date(posts[0].updatedAt) : now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteSiteUrl("/wiki"),
      lastModified: wikiGeneratedAt,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteSiteUrl("/about"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteSiteUrl("/privacy/whoop"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  const blogRoutes: MetadataRoute.Sitemap = posts
    .filter((post) => !post.noindex)
    .map((post) => ({
      url: absoluteSiteUrl(`/blog/${post.slug}`),
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly",
      priority: 0.8,
      images: [post.ogImageUrl ?? post.coverImageUrl].filter(Boolean) as string[],
    }));

  const wikiRoutes: MetadataRoute.Sitemap = wikiIndex.pages.map((page) => ({
    url: absoluteSiteUrl(`/wiki/${page.slug}`),
    lastModified: wikiGeneratedAt,
    changeFrequency: "monthly",
    priority: page.role === "hub" ? 0.75 : 0.65,
    images: [absoluteSiteUrl(page.heroImage)],
  }));

  return [...staticRoutes, ...blogRoutes, ...wikiRoutes];
}
