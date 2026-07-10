import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { StructuredData } from "@/components/seo/structured-data";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import {
  blogTopics,
  getBlogTopic,
  matchesBlogTopic,
} from "@/lib/blog/topics";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { absoluteSiteUrl, canonicalUrl } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return blogTopics.map((topic) => ({ slug: topic.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const topic = getBlogTopic(slug);
  if (!topic) return {};
  return {
    title: topic.title,
    description: topic.description,
    alternates: { canonical: canonicalUrl(`/blog/topics/${topic.slug}`) },
    openGraph: {
      title: topic.title,
      description: topic.description,
      url: canonicalUrl(`/blog/topics/${topic.slug}`),
      images: [{ url: topic.heroImage, width: 1200, height: 630 }],
    },
  };
}

export default async function BlogTopicPage({ params }: Props) {
  const { slug } = await params;
  const topic = getBlogTopic(slug);
  if (!topic) notFound();

  const [allPosts, wikiIndex] = await Promise.all([
    getPublishedBlogPosts(),
    Promise.resolve(getPublicWikiIndex()),
  ]);
  const posts = allPosts.filter((post) => matchesBlogTopic(post, topic));
  const wikiPages = topic.wikiSlugs
    .map((wikiSlug) => wikiIndex.pages.find((page) => page.slug === wikiSlug))
    .filter((page) => Boolean(page));
  const canonical = canonicalUrl(`/blog/topics/${topic.slug}`);

  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: topic.title,
              url: canonical,
              description: topic.description,
              about: { "@type": "Thing", name: topic.title },
              hasPart: posts.map((post) => ({
                "@type": "BlogPosting",
                name: post.title,
                url: absoluteSiteUrl(`/blog/${post.slug}`),
              })),
            },
            {
              "@type": "ItemList",
              name: `${topic.title} briefs`,
              numberOfItems: posts.length,
              itemListElement: posts.map((post, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: post.title,
                url: absoluteSiteUrl(`/blog/${post.slug}`),
              })),
            },
          ],
        }}
      />
      <SeoBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: "Topics", href: "/blog/topics" },
          { label: topic.title, href: `/blog/topics/${topic.slug}` },
        ]}
      />

      <header className="grid gap-8 border-b border-border/80 pb-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          <p className="eyebrow">Research topic</p>
          <h1 className="mt-4 max-w-4xl font-heading text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            {topic.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed text-muted-foreground">
            {topic.description}
          </p>
        </div>
        <Image
          src={topic.heroImage}
          alt=""
          width={1200}
          height={630}
          unoptimized
          priority
          className="aspect-[1.9/1] w-full border border-border/80 object-cover grayscale"
        />
      </header>

      <section className="mt-10 grid gap-px border border-border/80 bg-border/80 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
        <div className="bg-card/80 p-6">
          <p className="eyebrow">Working answer</p>
          <h2 className="mt-3 font-heading text-2xl font-semibold leading-tight text-foreground">
            {topic.question}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {topic.answer}
          </p>
        </div>
        <div className="bg-card/70 p-6">
          <p className="eyebrow">Signals this trail tracks</p>
          <ul className="mt-4 space-y-3">
            {topic.signals.map((signal) => (
              <li key={signal} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 size-1.5 shrink-0 bg-accent" aria-hidden />
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <p className="eyebrow">Source-backed briefs</p>
          <h2 className="mt-2 font-heading text-3xl font-semibold text-foreground">
            Latest developments
          </h2>
          <ol className="mt-6 divide-y divide-border/80 border-y border-border/80">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group grid gap-3 py-6 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[8rem_1fr_auto]"
                >
                  <span className="meta-tag">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString("en-CA", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        })
                      : "Published"}
                  </span>
                  <span>
                    <span className="block font-heading text-xl font-semibold leading-tight text-foreground group-hover:underline group-hover:decoration-accent">
                      {post.title}
                    </span>
                    <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">
                      {post.excerpt}
                    </span>
                  </span>
                  <ArrowRightIcon className="size-4 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-1" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow">Deeper context</p>
          <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
            Related wiki pages
          </h2>
          <ul className="mt-5 grid gap-px border border-border/80 bg-border/80">
            {wikiPages.map((page) => (
              <li key={page!.slug} className="bg-card/70">
                <Link
                  href={`/wiki/${page!.slug}`}
                  className="group block p-4 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium text-foreground group-hover:underline group-hover:decoration-accent">
                    {page!.title}
                  </span>
                  <span className="mt-1 line-clamp-3 block text-sm leading-relaxed text-muted-foreground">
                    {page!.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </MarketingPageFrame>
  );
}
