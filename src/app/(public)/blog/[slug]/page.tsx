import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { blogPosts } from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return blogPosts
    .filter((post) => post.status === "published")
    .map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = blogPosts.find(
    (item) => item.slug === slug && item.status === "published",
  );

  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = blogPosts.find(
    (item) => item.slug === slug && item.status === "published",
  );

  if (!post) notFound();

  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Blog
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        {post.title}
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        {post.description}
      </p>
    </MarketingPageFrame>
  );
}
