import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Blog",
  description: "Essays and field notes from Crashboard.",
};

export default async function BlogPage() {
  const [posts, index] = await Promise.all([
    getPublishedBlogPosts(),
    Promise.resolve(getPublicWikiIndex()),
  ]);
  const relatedWikiPages = index.pages.slice(0, 4);

  return (
    <MarketingPageFrame className="py-0">
      <section className="grid gap-10 border-b border-border/80 py-14 md:grid-cols-[1fr_26rem] md:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Blog
          </p>
          <h1 className="mt-4 font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
            Essays and field notes from Crashboard.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Published posts from the CMS appear here. The wiki remains the live
            public corpus for compiled notes and concept pages.
          </p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden border border-border/80 md:aspect-auto">
          <Image
            src="/images/marketing/crashboard-writing.png"
            alt="Desk with notes, cards, and writing materials"
            fill
            sizes="(min-width: 768px) 26rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
      </section>

      <section className="grid gap-10 border-b border-border/80 py-12 lg:grid-cols-[1fr_24rem]">
        <div>
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Posts
            </p>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
              Published articles
            </h2>
          </div>

          {posts.length > 0 ? (
            <div className="divide-y divide-border/80 border-y border-border/80">
              {posts.map((post) => (
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
                    <h3 className="font-heading text-xl font-semibold text-foreground">
                      {post.title}
                    </h3>
                    {post.excerpt ? (
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {post.excerpt}
                      </p>
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
              <h3 className="font-heading text-xl font-semibold text-foreground">
                No posts are published yet.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                The CMS is ready; published posts will appear here automatically.
              </p>
            </div>
          )}
        </div>

        <aside className="border-y border-border/80 py-6 lg:border-l lg:border-y-0 lg:pl-6">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Live corpus
          </p>
          <h2 className="mt-2 font-heading text-xl font-semibold text-foreground">
            Read the wiki now
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
                  {page.role}
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
