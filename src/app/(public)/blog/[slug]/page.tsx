import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getPublishedBlogPostBySlug } from "@/lib/blog/data";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { BlogPostBody } from "@/components/blog/blog-post-body";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);

  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);

  if (!post) notFound();

  return (
    <MarketingPageFrame>
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Blog
      </Link>

      <article className="mt-10">
        <header className="max-w-4xl">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {post.publishedAt
              ? new Date(post.publishedAt).toLocaleDateString()
              : "Blog"}
          </p>
          <h1 className="mt-4 font-heading text-4xl font-semibold text-foreground md:text-6xl md:leading-[1.04]">
            {post.title}
          </h1>
          {post.excerpt ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
        </header>

        {post.coverImageUrl ? (
          <div className="relative mt-10 aspect-[16/8] overflow-hidden border border-border/80">
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              unoptimized
              priority
            />
          </div>
        ) : null}

        <BlogPostBody html={post.contentHtml} className="mt-12" />
      </article>
    </MarketingPageFrame>
  );
}
