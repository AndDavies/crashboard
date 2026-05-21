import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPublishedBlogPostBySlug,
  getPublishedBlogPosts,
} from "@/lib/blog/data";
import { getPublicWikiIndex } from "@/lib/public-wiki/data";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { BlogPostBody } from "@/components/blog/blog-post-body";
import { Badge } from "@/components/ui/badge";
import { SeoBreadcrumbs } from "@/components/seo/breadcrumbs";
import { StructuredData } from "@/components/seo/structured-data";
import {
  SEO_AUTHOR_NAME,
  SEO_DEFAULT_IMAGE,
  SEO_SITE_NAME,
  absoluteSiteUrl,
  canonicalUrl,
  compactDescription,
} from "@/lib/seo/metadata";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);

  if (!post) return {};
  const description = compactDescription(
    post.metaDescription || post.excerpt || post.answerSummary,
  );
  const image = post.ogImageUrl ?? post.coverImageUrl ?? SEO_DEFAULT_IMAGE;
  const canonical = post.canonicalUrl ?? canonicalUrl(`/blog/${post.slug}`);

  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical },
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
  const description = compactDescription(
    post.metaDescription || post.excerpt || post.answerSummary,
  );
  const image = post.ogImageUrl ?? post.coverImageUrl ?? SEO_DEFAULT_IMAGE;
  const canonical = post.canonicalUrl ?? canonicalUrl(`/blog/${post.slug}`);
  const relatedWikiPages = wikiIndex.pages.filter((page) =>
    post.relatedWikiSlugs.includes(page.slug),
  );
  const relatedPosts = allPosts
    .filter((candidate) => candidate.slug !== post.slug)
    .filter((candidate) =>
      post.tags.length === 0
        ? true
        : candidate.tags.some((tag) => post.tags.includes(tag)),
    )
    .slice(0, 3);

  return (
    <MarketingPageFrame>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.seoTitle || post.title,
          name: post.title,
          description,
          image: image.startsWith("http") ? image : absoluteSiteUrl(image),
          author: {
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
            url: absoluteSiteUrl("/about"),
          },
          publisher: {
            "@type": "Person",
            name: SEO_AUTHOR_NAME,
          },
          isPartOf: {
            "@type": "Blog",
            name: `${SEO_SITE_NAME} Blog`,
            url: absoluteSiteUrl("/blog"),
          },
          datePublished: post.publishedAt ?? post.createdAt,
          dateModified: post.updatedAt,
          mainEntityOfPage: canonical,
          keywords: post.tags,
        }}
      />
      <SeoBreadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: post.title, href: `/blog/${post.slug}` },
        ]}
      />

      <article className="mt-10">
        <header className="max-w-4xl">
          <p className="eyebrow flex items-center gap-3">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString()
              : "Blog"}
          </p>
          <h1 className="mt-6 font-heading text-5xl leading-[0.98] font-light tracking-[-0.02em] text-foreground md:text-7xl">
            {post.title}
          </h1>
          <span className="accent-rule mt-6" aria-hidden />
          {post.excerpt ? (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
          {post.tags.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </header>

        {post.coverImageUrl ? (
          <figure className="relative mt-10 aspect-[1200/630] overflow-hidden border border-border/80">
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              unoptimized
              priority
            />
          </figure>
        ) : null}

        {post.answerSummary ? (
          <section className="mt-10 max-w-3xl border border-border/80 bg-card/70 p-6">
            <p className="eyebrow">Short answer</p>
            <p className="mt-3 text-lg leading-relaxed text-foreground">
              {post.answerSummary}
            </p>
          </section>
        ) : null}

        <BlogPostBody html={post.contentHtml} className="mt-12" />

        {post.sourceLinks.length > 0 ? (
          <section className="mt-14 border-t border-border/80 pt-8">
            <p className="eyebrow">Sources and references</p>
            <h2 className="mt-3 font-heading text-3xl font-light text-foreground">
              Where the post points
            </h2>
            <ol className="mt-6 grid gap-px border border-border/80 bg-border/80">
              {post.sourceLinks.map((source, sourceIndex) => (
                <li key={`${source.label}-${source.url}`} className="bg-card/70">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/source flex items-start gap-4 p-4 outline-none motion-safe:transition-colors hover:bg-card focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="ordinal mt-0.5">
                      S{String(sourceIndex + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">
                      <span className="font-medium text-foreground">
                        {source.label}
                      </span>
                      {source.note ? (
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {source.note}
                        </span>
                      ) : null}
                      <span className="meta-tag mt-2 block break-all">
                        {source.url}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {relatedWikiPages.length > 0 || relatedPosts.length > 0 ? (
          <section className="mt-14 grid gap-8 border-t border-border/80 pt-8 lg:grid-cols-2">
            {relatedWikiPages.length > 0 ? (
              <div>
                <p className="eyebrow">Related wiki pages</p>
                <h2 className="mt-3 font-heading text-3xl font-light text-foreground">
                  Continue the trail
                </h2>
                <ul className="mt-5 grid gap-px border border-border/80 bg-border/80">
                  {relatedWikiPages.map((page) => (
                    <li key={page.slug} className="bg-card/70">
                      <Link
                        href={`/wiki/${page.slug}`}
                        className="group block p-4 outline-none motion-safe:transition-colors hover:bg-card focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
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
                <h2 className="mt-3 font-heading text-3xl font-light text-foreground">
                  More from the blog
                </h2>
                <ul className="mt-5 grid gap-px border border-border/80 bg-border/80">
                  {relatedPosts.map((item) => (
                    <li key={item.slug} className="bg-card/70">
                      <Link
                        href={`/blog/${item.slug}`}
                        className="group block p-4 outline-none motion-safe:transition-colors hover:bg-card focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
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
      </article>
    </MarketingPageFrame>
  );
}
