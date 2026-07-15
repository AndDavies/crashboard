import type { MetadataRoute } from "next";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import { blogTopics, getBlogTopicsForPost } from "@/lib/blog/topics";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { listPublicSignals } from "@/lib/intelligence/public-data";
import { absoluteSiteUrl } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, wikiIndex, signals] = await Promise.all([
    getPublishedBlogPosts(),
    Promise.resolve(getPublicWikiIndex()),
    listPublicSignals(),
  ]);

  const wikiGeneratedAt = new Date(wikiIndex.generatedAt);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteSiteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/intelligence"),
      ...(signals[0]?.updatedAt ? { lastModified: new Date(signals[0].updatedAt) } : {}),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteSiteUrl("/intelligence/explore"),
      ...(signals[0]?.updatedAt ? { lastModified: new Date(signals[0].updatedAt) } : {}),
      changeFrequency: "daily",
      priority: 0.85,
    },
    {
      url: absoluteSiteUrl("/intelligence/articles"),
      ...(signals[0]?.updatedAt ? { lastModified: new Date(signals[0].updatedAt) } : {}),
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: absoluteSiteUrl("/blog"),
      ...(posts[0]?.updatedAt
        ? { lastModified: new Date(posts[0].updatedAt) }
        : {}),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteSiteUrl("/blog/topics"),
      ...(posts[0]?.updatedAt
        ? { lastModified: new Date(posts[0].updatedAt) }
        : {}),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: absoluteSiteUrl("/wiki"),
      lastModified: wikiGeneratedAt,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteSiteUrl("/about"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: absoluteSiteUrl("/privacy/whoop"),
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
      images: [
        post.ogImageUrl ??
          post.coverImageUrl ??
          getBlogTopicsForPost(post)[0]?.heroImage,
      ]
        .filter(Boolean)
        .map((image) => absoluteSiteUrl(image as string)),
    }));

  const topicRoutes: MetadataRoute.Sitemap = blogTopics.map((topic) => ({
    url: absoluteSiteUrl(`/blog/topics/${topic.slug}`),
    ...(posts[0]?.updatedAt
      ? { lastModified: new Date(posts[0].updatedAt) }
      : {}),
    changeFrequency: "weekly",
    priority: 0.75,
    images: [absoluteSiteUrl(topic.heroImage)],
  }));

  const wikiRoutes: MetadataRoute.Sitemap = wikiIndex.pages.map((page) => ({
    url: absoluteSiteUrl(`/wiki/${page.slug}`),
    lastModified: wikiGeneratedAt,
    changeFrequency: "monthly",
    priority: page.role === "hub" ? 0.75 : 0.65,
    images: [absoluteSiteUrl(page.heroImage)],
  }));

  const intelligenceRoutes: MetadataRoute.Sitemap = signals.map((signal) => ({
    url: absoluteSiteUrl(signal.href),
    lastModified: new Date(signal.updatedAt),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...intelligenceRoutes, ...topicRoutes, ...blogRoutes, ...wikiRoutes];
}
