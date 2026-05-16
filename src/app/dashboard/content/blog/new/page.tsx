import type { Metadata } from "next";
import { BlogPostEditor } from "@/components/dashboard/blog/blog-post-editor";
import { getBlogStarterPost } from "@/lib/blog/starter-posts";

export const metadata: Metadata = { title: "New blog post" };

type Props = {
  searchParams: Promise<{ starter?: string }>;
};

export default async function NewBlogPostPage({ searchParams }: Props) {
  const { starter } = await searchParams;
  const starterPost = getBlogStarterPost(starter);

  return (
    <div className="space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          CMS
        </p>
        <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
          New blog post
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Write, format, add images, and save the post when it is ready.
        </p>
      </section>
      <BlogPostEditor starterPost={starterPost} />
    </div>
  );
}
