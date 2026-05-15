import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { blogContentModel, blogPosts } from "@/lib/marketing/site-config";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "The future publishing surface for Crashboard essays and field notes.",
};

export default function BlogPage() {
  const index = getPublicWikiIndex();
  const hasPosts = blogPosts.length > 0;
  const relatedWikiPages = index.pages.slice(0, 4);

  return (
    <MarketingPageFrame className="py-0">
      <section className="grid gap-10 border-b border-border/80 py-14 md:grid-cols-[1fr_26rem] md:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Blog
          </p>
          <h1 className="mt-4 font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
            The publishing surface for Crashboard.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Posts are not published yet. This route is now ready for dynamic
            content from the CMS, while the wiki remains the live public corpus.
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
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Posts
              </p>
              <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
                Published articles
              </h2>
            </div>
          </div>

          {hasPosts ? (
            <div className="divide-y divide-border/80 border-y border-border/80">
              {blogPosts.map((post) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group grid gap-4 py-6 outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <h3 className="font-heading text-lg font-semibold text-foreground">
                      {post.title}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {post.description}
                    </p>
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
                The archive intentionally stays empty until there is real blog
                content. The CMS should populate this list with published posts
                only.
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

      <section className="py-14 md:py-20">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          CMS-ready shape
        </p>
        <h2 className="mt-2 max-w-2xl font-heading text-2xl font-semibold text-foreground">
          The next pass can connect storage and editing without reworking the
          public page.
        </h2>
        <div className="mt-8 grid gap-px overflow-hidden border border-border/80 bg-border/80 sm:grid-cols-2 lg:grid-cols-3">
          {blogContentModel.map((field) => (
            <div key={field.field} className="bg-background p-5">
              <h3 className="font-heading text-base font-semibold text-foreground">
                {field.field}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {field.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </MarketingPageFrame>
  );
}
