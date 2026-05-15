import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "@/lib/seo/metadata";

const disallowedPrivatePaths = [
  "/api/",
  "/auth/",
  "/dashboard/",
  "/login",
];

const discoveryBots = [
  "Googlebot",
  "Googlebot-Image",
  "Bingbot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "Applebot",
  "DuckDuckBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: disallowedPrivatePaths,
      },
      ...discoveryBots.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: disallowedPrivatePaths,
      })),
    ],
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: absoluteSiteUrl("/"),
  };
}
