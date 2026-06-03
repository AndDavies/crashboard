import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDashboardBlogPost } from "@/lib/blog/data";
import { BlogPostBody } from "@/components/blog/blog-post-body";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Preview blog post" };

type Props = {
  params: Promise<{ postId: string }>;
};

export default async function BlogPreviewPage({ params }: Props) {
  const { postId } = await params;
  const post = await getDashboardBlogPost(postId);

  if (!post) notFound();

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 border-b border-border/80 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge variant="outline" className="font-normal capitalize">
            {post.status} preview
          </Badge>
          <h2 className="mt-3 font-heading text-3xl font-semibold text-foreground">
            {post.title}
          </h2>
          {post.excerpt ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          ) : null}
        </div>
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={`/dashboard/content/blog/${post.id}`} />}
        >
          Back to editor
        </Button>
      </section>

      {post.coverImageUrl ? (
        <figure className="relative aspect-[1200/630] overflow-hidden border border-border/80">
          <Image
            src={post.coverImageUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            unoptimized
          />
        </figure>
      ) : null}

      <BlogPostBody html={post.contentHtml} />
    </div>
  );
}
