import { describe, expect, it } from "vitest";
import type { BlogPostSummary } from "@/lib/blog/data";
import { getBlogTopicsForPost } from "@/lib/blog/topics";

describe("blog topics", () => {
  it("maps a post to durable topic hubs from its public metadata", () => {
    const post = {
      title: "Deployment becomes the market",
      excerpt: "Enterprise AI operating models need implementation capacity.",
      answerSummary: "Agentic workflows require clear ownership.",
      focusTopic: "AI deployment",
      tags: ["artificial intelligence", "strategy"],
    } as BlogPostSummary;

    expect(getBlogTopicsForPost(post).map((topic) => topic.slug)).toContain(
      "ai-operating-models",
    );
  });
});
