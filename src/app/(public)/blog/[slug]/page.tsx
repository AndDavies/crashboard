import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightIcon,
  BookOpenIcon,
  ClockIcon,
  ExternalLinkIcon,
  LinkIcon,
} from "lucide-react";
import { BlogPostBody } from "@/components/blog/blog-post-body";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { StructuredData } from "@/components/seo/structured-data";
import { Badge } from "@/components/ui/badge";
import { prepareBlogArticleHtml } from "@/lib/blog/article-html";
import {
  getPublishedBlogPostBySlug,
  getPublishedBlogPosts,
} from "@/lib/blog/data";
import { getBlogTopicsForPost } from "@/lib/blog/topics";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import {
  SEO_AUTHOR_NAME,
  SEO_AUTHOR_SAME_AS,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
  compactDescription,
} from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };

function splitSourceNote(note: string | undefined) {
  const parts = (note ?? "")
    .split(/\s+\/\s+/g)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) return { sourceName: parts[0] ?? "", tag: "" };
  return {
    sourceName: parts.slice(0, -1).join(" / "),
    tag: parts.at(-1) ?? "",
  };
}

function plainTextFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCountFromHtml(html: string) {
  const text = plainTextFromHtml(html);
  return text ? text.split(/\s+/g).filter(Boolean).length : 0;
}

function formatDate(input: string) {
  return new Date(input).toLocaleDateString("en-CA", {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

function socialImageForPost(
  post: NonNullable<Awaited<ReturnType<typeof getPublishedBlogPostBySlug>>>,
) {
  return (
    post.ogImageUrl ??
    post.coverImageUrl ??
    getBlogTopicsForPost(post)[0]?.heroImage ??
    SEO_DEFAULT_IMAGE
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);
  if (!post) return {};

  const description = compactDescription(
    post.metaDescription || post.excerpt || post.answerSummary,
  );
  const image = socialImageForPost(post);
  const canonical = post.canonicalUrl ?? canonicalUrl(`/blog/${post.slug}`);

  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical },
    authors: [{ name: SEO_AUTHOR_NAME, url: absoluteSiteUrl("/about") }],
    robots: post.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      type: "article",
      title: post.seoTitle || post.title,
      description,
      url: canonical,
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      authors: [SEO_AUTHOR_NAME],
      tags: post.tags,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.seoTitle || post.title,
      description,
      images: [image],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, wikiIndex, allPosts] = await Promise.all([
    getPublishedBlogPostBySlug(slug),
    Promise.resolve(getPublicWikiIndex()),
    getPublishedBlogPosts(),
  ]);
  if (!post) notFound();

  const prepared = prepareBlogArticleHtml(post.contentHtml, {
    answerSummary: post.answerSummary,
  });
  const description = compactDescription(
    post.metaDescription || post.excerpt || post.answerSummary,
  );
  const image = socialImageForPost(post);
  const canonical = post.canonicalUrl ?? canonicalUrl(`/blog/${post.slug}`);
  const topics = getBlogTopicsForPost(post);
  const relatedWikiPages = wikiIndex.pages.filter((page) =>
    post.relatedWikiSlugs.includes(page.slug),
  );
  const relatedPosts = allPosts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => ({
      post: candidate,
      score: candidate.tags.filter((tag) => post.tags.includes(tag)).length,
    }))
    .filter(({ score }) => score > 0 || post.tags.length === 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ post: candidate }) => candidate);
  const articleCitations = post.sourceLinks.map((source) => ({
    "@type": "CreativeWork",
    name: source.label,
    url: source.url,
    ...(source.note ? { description: source.note } : {}),
  }));
  const articleAbout = Array.from(
    new Set([post.focusTopic, ...post.tags].map((item) => item.trim()).filter(Boolean)),
  ).map((name) => ({ "@type": "Thing", name }));
  const wordCount = wordCountFromHtml(prepared.html);
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 225));
  const publishedDate = post.publishedAt ?? post.createdAt;
  const showUpdatedDate =
    new Date(post.updatedAt).getTime() - new Date(publishedDate).getTime() >
    24 * 60 * 60 * 1000;

  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          "@id": `${canonical}#article`,
          headline: post.seoTitle || post.title,
          name: post.title,
          description,
          image: absoluteSiteUrl(image),
          author: {
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
            url: absoluteSiteUrl("/about"),
            sameAs: SEO_AUTHOR_SAME_AS,
          },
          publisher: {
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
            url: absoluteSiteUrl("/about"),
          },
          isPartOf: {
            "@type": "Blog",
            name: `${SEO_SITE_NAME} Blog`,
            url: absoluteSiteUrl("/blog"),
          },
          datePublished: publishedDate,
          dateModified: post.updatedAt,
          mainEntityOfPage: canonical,
          keywords: post.tags,
          abstract: post.answerSummary || description,
          articleSection: post.focusTopic || undefined,
          inLanguage: "en-CA",
          isAccessibleForFree: true,
          wordCount,
          timeRequired: `PT${readingMinutes}M`,
          ...(articleCitations.length > 0 ? { citation: articleCitations } : {}),
          ...(articleAbout.length > 0 ? { about: articleAbout } : {}),
        }}
      />
      <SeoBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: post.title, href: `/blog/${post.slug}` },
        ]}
      />

      <article className="mt-8">
        <header className="max-w-5xl border-b border-border/80 pb-10">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Morning brief
          </p>
          <h1 className="mt-5 max-w-5xl break-words font-heading text-4xl font-semibold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            {post.title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link href="/about" className="font-medium text-foreground underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
              {SEO_AUTHOR_NAME}
            </Link>
            <span>{formatDate(publishedDate)}</span>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-4" aria-hidden />
              {readingMinutes} min read
            </span>
            <a href="#sources" className="inline-flex items-center gap-1.5 text-foreground underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
              <LinkIcon className="size-4" aria-hidden />
              {post.sourceLinks.length} cited sources
            </a>
            {showUpdatedDate ? <span>Updated {formatDate(post.updatedAt)}</span> : null}
          </div>
          {post.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link key={tag} href={`/blog?tag=${encodeURIComponent(tag.toLowerCase())}`}>
                  <Badge variant="outline" className="rounded-none font-normal">
                    {tag}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        {post.coverImageUrl ? (
          <figure className="relative mt-8 aspect-[1200/630] max-w-5xl overflow-hidden border border-border/80">
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              sizes="(min-width: 1280px) 1024px, 100vw"
              className="object-cover"
              unoptimized
              priority
            />
          </figure>
        ) : null}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="min-w-0">
            {post.answerSummary ? (
              <section className="max-w-3xl border-y border-border/80 border-l-2 border-l-accent bg-card/70 px-5 py-5">
                <p className="eyebrow">Bottom line</p>
                <p className="mt-3 text-lg leading-relaxed text-foreground">
                  {post.answerSummary}
                </p>
              </section>
            ) : post.excerpt ? (
              <p className="max-w-3xl text-lg leading-relaxed text-muted-foreground">
                {post.excerpt}
              </p>
            ) : null}

            <BlogPostBody html={prepared.html} className="mt-10" />

            {post.sourceLinks.length > 0 ? (
              <section id="sources" className="mt-14 max-w-3xl scroll-mt-24 border-t border-border/80 pt-8">
                <p className="eyebrow">Evidence trail</p>
                <h2 className="mt-3 font-heading text-3xl font-semibold text-foreground">
                  Sources and references
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Each source opens the original publication. Labels identify the publisher and the role the source plays in this brief.
                </p>
                <ol className="mt-6 grid gap-3">
                  {post.sourceLinks.map((source, sourceIndex) => {
                    const { sourceName, tag } = splitSourceNote(source.note);
                    return (
                      <li key={`${source.label}-${source.url}`} className="border border-border/80 bg-card/70 shadow-sm">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group/source grid gap-3 p-4 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[auto_1fr_auto]"
                        >
                          <span className="ordinal mt-1">
                            S{String(sourceIndex + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0">
                            <span className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="inline-flex bg-foreground px-2 py-1 font-sans text-[10px] font-bold uppercase text-background">
                                Source
                              </span>
                              {sourceName ? (
                                <span className="text-sm font-semibold text-foreground">
                                  {sourceName}
                                </span>
                              ) : null}
                              {tag ? (
                                <span className="inline-flex border border-accent bg-accent px-2 py-1 font-sans text-[10px] font-bold uppercase text-accent-foreground">
                                  {tag}
                                </span>
                              ) : null}
                            </span>
                            <span className="block font-heading text-lg font-semibold leading-snug text-foreground underline decoration-accent/40 decoration-2 underline-offset-4 group-hover/source:decoration-accent">
                              {source.label}
                            </span>
                            <span className="meta-tag mt-2 block truncate normal-case">
                              {source.url}
                            </span>
                          </span>
                          <ExternalLinkIcon className="mt-1 size-4 text-muted-foreground" aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}

            {relatedWikiPages.length > 0 || relatedPosts.length > 0 ? (
              <section className="mt-14 grid gap-8 border-t border-border/80 pt-8 md:grid-cols-2">
                {relatedWikiPages.length > 0 ? (
                  <div>
                    <p className="eyebrow">Related wiki pages</p>
                    <h2 className="mt-3 font-heading text-2xl font-semibold text-foreground">
                      Deeper context
                    </h2>
                    <ul className="mt-5 grid gap-px border border-border/80 bg-border/80">
                      {relatedWikiPages.map((page) => (
                        <li key={page.slug} className="bg-card/70">
                          <Link href={`/wiki/${page.slug}`} className="group block p-4 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="font-medium text-foreground group-hover:underline group-hover:decoration-accent">
                              {page.title}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                              {page.description}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {relatedPosts.length > 0 ? (
                  <div>
                    <p className="eyebrow">Related posts</p>
                    <h2 className="mt-3 font-heading text-2xl font-semibold text-foreground">
                      Continue reading
                    </h2>
                    <ul className="mt-5 grid gap-px border border-border/80 bg-border/80">
                      {relatedPosts.map((item) => (
                        <li key={item.slug} className="bg-card/70">
                          <Link href={`/blog/${item.slug}`} className="group block p-4 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring">
                            <span className="font-medium text-foreground group-hover:underline group-hover:decoration-accent">
                              {item.title}
                            </span>
                            <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
                              {item.excerpt}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24" aria-label="Article navigation">
            {prepared.headings.some((heading) => heading.level === 2) ? (
              <nav className="border border-border/80 bg-card/70 p-4" aria-label="Table of contents">
                <p className="eyebrow flex items-center gap-2">
                  <BookOpenIcon className="size-3.5" aria-hidden />
                  In this brief
                </p>
                <ol className="mt-4 space-y-2.5">
                  {prepared.headings
                    .filter((heading) => heading.level === 2)
                    .map((heading) => (
                      <li key={heading.id}>
                        <a href={`#${heading.id}`} className="block text-sm leading-snug text-muted-foreground hover:text-foreground hover:underline hover:decoration-accent">
                          {heading.text}
                        </a>
                      </li>
                    ))}
                </ol>
              </nav>
            ) : null}

            <div className="border border-border/80 bg-card/70 p-4">
              <p className="eyebrow">Article details</p>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Words</dt>
                  <dd className="font-medium text-foreground">{wordCount.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Sources</dt>
                  <dd className="font-medium text-foreground">{post.sourceLinks.length}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="text-right font-medium text-foreground">{formatDate(publishedDate)}</dd>
                </div>
              </dl>
              <a href="#sources" className="cta-secondary mt-5 w-full">
                Jump to sources
                <ArrowRightIcon className="size-4" aria-hidden />
              </a>
            </div>

            {topics.length > 0 ? (
              <div className="border border-border/80 bg-card/70 p-4">
                <p className="eyebrow">Research topics</p>
                <ul className="mt-3 space-y-2">
                  {topics.map((topic) => (
                    <li key={topic.slug}>
                      <Link href={`/blog/topics/${topic.slug}`} className="group flex items-center justify-between gap-3 text-sm font-medium text-foreground hover:underline hover:decoration-accent">
                        {topic.title}
                        <ArrowRightIcon className="size-3.5 shrink-0 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </article>
    </MarketingPageFrame>
  );
}
