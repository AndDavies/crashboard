import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  SearchIcon,
} from "lucide-react";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { StructuredData } from "@/components/seo/structured-data";
import { Badge } from "@/components/ui/badge";
import { getPublishedBlogPosts } from "@/lib/blog/data";
import {
  blogTopics,
  getBlogTopicsForPost,
  matchesBlogTopic,
} from "@/lib/blog/topics";
import {
  SEO_AUTHOR_NAME,
  SEO_AUTHOR_SAME_AS,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
} from "@/lib/seo/metadata";

const PAGE_SIZE = 12;
const BLOG_DESCRIPTION =
  "Source-backed morning briefs and field notes from Andrew Davies on AI systems, defence, infrastructure, financial rails, and strategic judgment.";

type BlogSearchParams = {
  page?: string;
  q?: string;
  tag?: string;
};

type Props = { searchParams: Promise<BlogSearchParams> };

function parsePage(input: string | undefined) {
  const value = Number.parseInt(input ?? "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function blogHref(
  params: BlogSearchParams,
  overrides: Partial<BlogSearchParams>,
) {
  const next = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (next.q?.trim()) search.set("q", next.q.trim());
  if (next.tag?.trim()) search.set("tag", next.tag.trim());
  if (parsePage(next.page) > 1) search.set("page", String(parsePage(next.page)));
  const query = search.toString();
  return query ? `/blog?${query}` : "/blog";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const page = parsePage(params.page);
  const filtered = Boolean(params.q?.trim() || params.tag?.trim());
  const canonical =
    page > 1 && !filtered ? canonicalUrl(`/blog?page=${page}`) : canonicalUrl("/blog");

  return {
    title: page > 1 ? `Blog Archive, Page ${page}` : "Blog",
    description: BLOG_DESCRIPTION,
    alternates: { canonical },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title: "Blog · Crashboard",
      description: BLOG_DESCRIPTION,
      url: canonical,
    },
  };
}

export default async function BlogPage({ searchParams }: Props) {
  const params = await searchParams;
  const posts = await getPublishedBlogPosts();
  const query = params.q?.trim().toLowerCase() ?? "";
  const selectedTag = params.tag?.trim().toLowerCase() ?? "";
  const allTags = Array.from(
    new Set(posts.flatMap((post) => post.tags.map((tag) => tag.trim()).filter(Boolean))),
  ).toSorted((a, b) => a.localeCompare(b));
  const filteredPosts = posts.filter((post) => {
    if (
      selectedTag &&
      !post.tags.some((tag) => tag.toLowerCase() === selectedTag)
    ) {
      return false;
    }
    if (!query) return true;
    const haystack = [
      post.title,
      post.excerpt,
      post.answerSummary,
      post.focusTopic,
      ...post.tags,
    ]
      .join(" ")
      .toLowerCase();
    return query
      .split(/\s+/)
      .filter(Boolean)
      .every((term) => haystack.includes(term));
  });
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const requestedPage = parsePage(params.page);
  const currentPage = Math.min(requestedPage, totalPages);
  const visiblePosts = filteredPosts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const visibleStart = filteredPosts.length
    ? (currentPage - 1) * PAGE_SIZE + 1
    : 0;
  const visibleEnd = Math.min(currentPage * PAGE_SIZE, filteredPosts.length);
  const featuredPost =
    currentPage === 1 && !query && !selectedTag ? visiblePosts[0] ?? null : null;
  const archivePosts = featuredPost ? visiblePosts.slice(1) : visiblePosts;
  const featuredImage = featuredPost
    ? featuredPost.coverImageUrl ??
      getBlogTopicsForPost(featuredPost)[0]?.heroImage ??
      "/images/marketing/crashboard-writing.jpg"
    : null;

  return (
    <MarketingPageFrame className="py-0">
      <StructuredData
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Crashboard Blog",
            url: absoluteSiteUrl("/blog"),
            description: BLOG_DESCRIPTION,
            author: {
              "@type": "Person",
              name: SEO_AUTHOR_NAME,
              url: absoluteSiteUrl("/about"),
              sameAs: SEO_AUTHOR_SAME_AS,
            },
            publisher: { "@type": "Person", name: SEO_AUTHOR_NAME },
            isPartOf: {
              "@type": "WebSite",
              name: SEO_SITE_NAME,
              url: absoluteSiteUrl("/"),
            },
          },
          {
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Crashboard source-backed briefs",
            numberOfItems: filteredPosts.length,
            itemListElement: visiblePosts.map((post, index) => ({
              "@type": "ListItem",
              position: visibleStart + index,
              name: post.title,
              url: absoluteSiteUrl(`/blog/${post.slug}`),
            })),
          },
        ]}
      />

      <header className="border-b border-foreground/80 py-12 md:py-16">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-end">
          <div>
            <p className="eyebrow">Crashboard blog</p>
            <h1 className="mt-4 max-w-4xl font-heading text-5xl font-semibold leading-[1.02] text-foreground sm:text-6xl">
              Daily signals, connected to durable research.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Source-backed morning briefs on AI systems, defence, infrastructure,
              financial rails, and the operating decisions behind the headlines.
            </p>
          </div>

          <form action="/blog" method="get" className="border-t border-foreground/80 pt-4">
            <label htmlFor="blog-search" className="eyebrow flex items-center gap-2">
              <SearchIcon className="size-3.5" aria-hidden />
              Search the archive
            </label>
            <div className="mt-3 flex">
              <input
                id="blog-search"
                name="q"
                type="search"
                defaultValue={params.q ?? ""}
                placeholder="Search topics, entities, or signals"
                className="min-w-0 flex-1 border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              {selectedTag ? <input type="hidden" name="tag" value={selectedTag} /> : null}
              <button
                type="submit"
                className="inline-flex size-10 shrink-0 items-center justify-center border border-l-0 border-foreground bg-foreground text-background outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Search"
              >
                <SearchIcon className="size-4" aria-hidden />
              </button>
            </div>
          </form>
        </div>
      </header>

      {featuredPost && featuredImage ? (
        <section className="border-b border-foreground/80 py-8 md:py-12" aria-labelledby="featured-story">
          <Link
            href={`/blog/${featuredPost.slug}`}
            className="group grid gap-6 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)] lg:items-end"
          >
            <figure className="relative aspect-[16/9] overflow-hidden bg-muted">
              <Image
                src={featuredImage}
                alt=""
                fill
                priority
                unoptimized={featuredImage.endsWith(".svg") || featuredImage.startsWith("http")}
                sizes="(min-width: 1024px) 62vw, 100vw"
                className="object-cover grayscale transition-transform duration-500 group-hover:scale-[1.015]"
              />
            </figure>
            <div className="pb-1">
              <p className="eyebrow">Featured / {featuredPost.focusTopic || "Current brief"}</p>
              <h2 id="featured-story" className="mt-3 font-heading text-3xl font-semibold leading-tight text-foreground md:text-4xl">
                {featuredPost.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                {featuredPost.excerpt}
              </p>
              <div className="mt-5 flex items-center justify-between border-t border-border/80 pt-4 text-sm font-semibold text-foreground">
                <span>
                  {featuredPost.publishedAt
                    ? new Date(featuredPost.publishedAt).toLocaleDateString("en-CA", {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      })
                    : "Published"}
                </span>
                <span className="inline-flex items-center gap-2">
                  Read story
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </span>
              </div>
            </div>
          </Link>
        </section>
      ) : null}

      <section className="border-b border-border/80 py-8" aria-labelledby="topic-heading">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="eyebrow">Research topics</p>
            <h2 id="topic-heading" className="mt-2 font-heading text-2xl font-semibold text-foreground">
              Follow a recurring question.
            </h2>
          </div>
          <Link href="/blog/topics" className="link-accent inline-flex items-center gap-2 text-sm">
            View all topic hubs
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="mt-5 grid border-y border-foreground/80 sm:grid-cols-2 lg:grid-cols-5">
          {blogTopics.map((topic) => {
            const count = posts.filter((post) => matchesBlogTopic(post, topic)).length;
            return (
              <li key={topic.slug} className="border-b border-border/80 sm:border-r lg:border-b-0 last:border-r-0">
                <Link
                  href={`/blog/topics/${topic.slug}`}
                  className="group block h-full px-3 py-4 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="meta-tag">{count} briefs</span>
                  <span className="mt-2 block font-heading text-base font-semibold leading-snug text-foreground group-hover:underline group-hover:decoration-accent">
                    {topic.title}
                  </span>
                  <span className="mt-2 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                    {topic.question}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="py-10">
        <div className="flex flex-col gap-5 border-b border-border/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Archive</p>
            <h2 className="mt-2 font-heading text-3xl font-semibold text-foreground">
              {query
                ? `Results for “${params.q?.trim()}”`
                : selectedTag
                  ? `Tagged ${selectedTag}`
                  : "Latest briefs"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Showing {visibleStart}–{visibleEnd} of {filteredPosts.length} posts
            </p>
          </div>

          <form action="/blog" method="get" className="flex flex-wrap items-end gap-2">
            {query ? <input type="hidden" name="q" value={params.q?.trim()} /> : null}
            <label htmlFor="blog-tag" className="space-y-1.5">
              <span className="eyebrow block">Filter by tag</span>
              <select
                id="blog-tag"
                name="tag"
                defaultValue={selectedTag}
                className="h-10 max-w-[16rem] border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag.toLowerCase()}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="cta-secondary h-10 px-4 py-0">
              Apply
            </button>
            {query || selectedTag ? (
              <Link href="/blog" className="link-accent px-2 py-2 text-sm">
                Clear
              </Link>
            ) : null}
          </form>
        </div>

        {archivePosts.length > 0 ? (
          <ol className="divide-y divide-border/80 border-b border-border/80">
            {archivePosts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="group grid gap-4 px-1 py-6 outline-none motion-safe:transition-colors hover:bg-card/70 focus-visible:bg-card/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid-cols-[9rem_minmax(0,1fr)_auto] md:gap-6"
                >
                  <span className="meta-tag pt-1">
                    {post.publishedAt
                      ? new Date(post.publishedAt).toLocaleDateString("en-CA", {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        })
                      : "Published"}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-heading text-xl font-semibold leading-tight text-foreground sm:text-2xl">
                      {post.title}
                    </span>
                    {post.excerpt ? (
                      <span className="mt-2 line-clamp-3 block max-w-3xl text-sm leading-relaxed text-muted-foreground">
                        {post.excerpt}
                      </span>
                    ) : null}
                    {post.tags.length > 0 ? (
                      <span className="mt-3 flex flex-wrap gap-1.5">
                        {post.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="rounded-none font-normal">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRightIcon
                    className="mt-1 size-4 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ol>
        ) : featuredPost ? null : (
          <div className="border-b border-border/80 py-12">
            <h3 className="font-heading text-2xl font-semibold text-foreground">
              No matching briefs.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Try a broader phrase or clear the active tag filter.
            </p>
            <Link href="/blog" className="link-accent mt-5 inline-flex text-sm">
              Reset archive
            </Link>
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="mt-7 flex items-center justify-between gap-4" aria-label="Blog pagination">
            {currentPage > 1 ? (
              <Link
                href={blogHref(params, { page: String(currentPage - 1) })}
                rel="prev"
                className="cta-secondary"
              >
                <ArrowLeftIcon className="size-4" aria-hidden />
                Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="meta-tag">
              Page {currentPage} of {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link
                href={blogHref(params, { page: String(currentPage + 1) })}
                rel="next"
                className="cta-secondary"
              >
                Older
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </MarketingPageFrame>
  );
}
