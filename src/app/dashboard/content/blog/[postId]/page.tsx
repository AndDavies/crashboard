import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getDashboardBlogPost,
  getDashboardBlogPostRevisions,
} from "@/lib/blog/data";
import { BlogPostEditor } from "@/components/dashboard/blog/blog-post-editor";

export const metadata: Metadata = { title: "Edit blog post" };

type Props = {
  params: Promise<{ postId: string }>;
};

export default async function EditBlogPostPage({ params }: Props) {
  const { postId } = await params;
  const [post, revisions] = await Promise.all([
    getDashboardBlogPost(postId),
    getDashboardBlogPostRevisions(postId),
  ]);

  if (!post) notFound();

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow">CMS</p>
        <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
          Edit blog post
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Rich text content is saved as editor JSON and sanitized HTML for the
          public blog.
        </p>
      </section>
      <BlogPostEditor post={post} revisions={revisions} />
    </div>
  );
}
