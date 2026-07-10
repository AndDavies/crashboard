import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { StructuredData } from "@/components/seo/structured-data";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import { blogTopics, matchesBlogTopic } from "@/lib/blog/topics";
import { absoluteSiteUrl, canonicalUrl } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Research Topics",
  description:
    "Durable Crashboard research hubs connecting daily source-backed briefs with related analysis and public wiki pages.",
  alternates: { canonical: canonicalUrl("/blog/topics") },
};

export default async function BlogTopicsPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Crashboard research topics",
          url: absoluteSiteUrl("/blog/topics"),
          hasPart: blogTopics.map((topic) => ({
            "@type": "CollectionPage",
            name: topic.title,
            url: absoluteSiteUrl(`/blog/topics/${topic.slug}`),
            description: topic.description,
          })),
        }}
      />
      <header className="max-w-4xl border-b border-border/80 pb-10">
        <p className="eyebrow">Research topics</p>
        <h1 className="mt-4 font-heading text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
          Follow a question across the daily briefs and public wiki.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
          These hubs collect recurring signals into durable research trails. Each
          one combines current briefs with deeper notes so a reader can move from
          a daily development to the operating system behind it.
        </p>
      </header>

      <ol className="mt-10 grid gap-px border border-border/80 bg-border/80 lg:grid-cols-2">
        {blogTopics.map((topic) => {
          const count = posts.filter((post) => matchesBlogTopic(post, topic)).length;
          return (
            <li key={topic.slug} className="bg-card/70">
              <Link
                href={`/blog/topics/${topic.slug}`}
                className="group grid h-full gap-5 p-5 outline-none motion-safe:transition-colors hover:bg-card focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[9rem_1fr]"
              >
                <Image
                  src={topic.heroImage}
                  alt=""
                  width={1200}
                  height={630}
                  unoptimized
                  className="aspect-[1.45/1] w-full border border-border/80 object-cover grayscale"
                />
                <span>
                  <span className="meta-tag">{count} matching briefs</span>
                  <span className="mt-2 block font-heading text-2xl font-semibold leading-tight text-foreground">
                    {topic.title}
                  </span>
                  <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                    {topic.description}
                  </span>
                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-accent">
                    Open topic
                    <ArrowRightIcon className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </MarketingPageFrame>
  );
}
