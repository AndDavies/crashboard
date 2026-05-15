import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Badge } from "@/components/ui/badge";
import { StructuredData } from "@/components/seo/structured-data";
import {
  SEO_AUTHOR_NAME,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
} from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Field notes from Andrew Davies on AI workflows, research systems, knowledge management, defence strategy, and the source trails behind the wiki.",
  alternates: { canonical: canonicalUrl("/blog") },
  openGraph: {
    title: "Blog · Crashboard",
    description:
      "Field notes from Andrew Davies on AI workflows, research systems, knowledge management, defence strategy, and the source trails behind the wiki.",
    url: canonicalUrl("/blog"),
    images: [{ url: SEO_DEFAULT_IMAGE, width: 1200, height: 630 }],
  },
};

type Props = {
  searchParams: Promise<{ tag?: string }>;
};

export default async function BlogPage({ searchParams }: Props) {
  const { tag } = await searchParams;
  const [posts, index] = await Promise.all([
    getPublishedBlogPosts(),
    Promise.resolve(getPublicWikiIndex()),
  ]);
  const selectedTag = tag?.trim().toLowerCase() ?? "";
  const allTags = Array.from(
    new Set(posts.flatMap((post) => post.tags.map((item) => item.toLowerCase()))),
  ).sort();
  const visiblePosts = selectedTag
    ? posts.filter((post) =>
        post.tags.some((item) => item.toLowerCase() === selectedTag),
      )
    : posts;
  const relatedWikiPages = index.pages.slice(0, 4);

  return (
    <MarketingPageFrame className="py-0">
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: "Crashboard Blog",
          url: absoluteSiteUrl("/blog"),
          description:
            "Field notes from Andrew Davies on AI workflows, research systems, knowledge management, defence strategy, and the source trails behind the wiki.",
          author: { "@type": "Person", name: SEO_AUTHOR_NAME },
          publisher: { "@type": "Person", name: SEO_AUTHOR_NAME },
          isPartOf: {
            "@type": "WebSite",
            name: SEO_SITE_NAME,
            url: absoluteSiteUrl("/"),
          },
        }}
      />
      <section className="technical-grid relative overflow-hidden border-b border-border/80 py-20 md:py-28">
        <Image
          src="/images/marketing/crashboard-writing.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-[0.16] grayscale contrast-125 brightness-125 mix-blend-multiply"
          priority
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(250,250,248,0.96)_0%,rgba(250,250,248,0.86)_54%,rgba(250,250,248,0.52)_100%)]" />
        <div className="relative max-w-5xl">
          <p className="flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Blog
          </p>
          <h1 className="mt-8 font-heading text-5xl leading-[0.98] font-light tracking-[-0.02em] text-foreground md:text-7xl">
            Notes on AI work, source-backed research, and strategy.
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
            Longer pieces will live here: how I use AI, keep research
            traceable, build knowledge systems, and turn messy judgment into
            pages someone else can inspect.
          </p>
        </div>
      </section>

      <section className="grid gap-10 border-b border-border/80 py-12 lg:grid-cols-[1fr_24rem]">
        <div>
          <div className="mb-8">
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
              Posts
            </p>
            <h2 className="mt-3 font-heading text-3xl font-light text-foreground">
              {selectedTag ? `Tagged ${selectedTag}` : "Published notes"}
            </h2>
            {allTags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/blog">
                  <Badge variant={selectedTag ? "outline" : "secondary"}>All</Badge>
                </Link>
                {allTags.map((item) => (
                  <Link key={item} href={`/blog?tag=${encodeURIComponent(item)}`}>
                    <Badge
                      variant={selectedTag === item ? "secondary" : "outline"}
                      className="capitalize"
                    >
                      {item}
                    </Badge>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          {visiblePosts.length > 0 ? (
            <div className="divide-y divide-border/80 border-y border-border/80">
              {visiblePosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group grid gap-5 py-7 outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[12rem_1fr_auto]"
                >
                  <div className="text-sm text-muted-foreground">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString()
                      : "Scheduled"}
                  </div>
                  <div>
                    <h3 className="font-heading text-2xl leading-tight font-light text-foreground">
                      {post.title}
                    </h3>
                    {post.excerpt ? (
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {post.excerpt}
                      </p>
                    ) : null}
                    {post.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {post.tags.slice(0, 4).map((item) => (
                          <Badge key={item} variant="outline" className="font-normal">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <ArrowRightIcon
                    className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              ))}
            </div>
          ) : (
            <div className="border-y border-border/80 py-10">
              <h3 className="font-heading text-2xl font-light text-foreground">
                No public posts yet.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                I am keeping the archive empty until the CMS is publishing real
                work. Start with the wiki; it already has the compiled notes.
              </p>
            </div>
          )}
        </div>

        <aside className="border-y border-border/80 py-6 lg:border-l lg:border-y-0 lg:pl-6">
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Start here
          </p>
          <h2 className="mt-3 font-heading text-2xl font-light text-foreground">
            Current public corpus
          </h2>
          <div className="mt-5 space-y-4">
            {relatedWikiPages.map((page) => (
              <Link
                key={page.slug}
                href={`/wiki/${page.slug}`}
                className="group block outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium text-foreground group-hover:underline">
                  {page.title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {page.description}
                </span>
              </Link>
            ))}
          </div>
          <Link
            href="/wiki"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Browse wiki
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </aside>
      </section>
    </MarketingPageFrame>
  );
}
