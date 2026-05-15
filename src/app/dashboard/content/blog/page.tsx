import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { getDashboardBlogPosts } from "@/lib/blog/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Blog CMS" };

type Props = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    includeDeleted?: string;
  }>;
};

export default async function DashboardBlogPage({ searchParams }: Props) {
  const filters = await searchParams;
  const posts = await getDashboardBlogPosts({
    q: filters.q,
    status: filters.status,
    includeDeleted: filters.includeDeleted === "true",
  });

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            CMS
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
            Blog posts
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Manage the posts that feed the public blog. Drafts stay private until
            you publish them.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/dashboard/content/blog/new" />}>
          <PlusIcon className="size-4" />
          Add New Post
        </Button>
      </section>

      <form className="grid gap-3 rounded-xl border border-border/80 bg-background p-4 md:grid-cols-[1fr_12rem_auto]">
        <Input name="q" placeholder="Search articles" defaultValue={filters.q ?? ""} />
        <select
          name="status"
          defaultValue={filters.status ?? "all"}
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="scheduled">Scheduled</option>
          <option value="archived">Archived</option>
        </select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {posts.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => (
            <article
              key={post.id}
              className="flex min-h-56 flex-col justify-between rounded-xl border border-border/80 bg-background p-5 shadow-sm"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal capitalize">
                    {post.status}
                  </Badge>
                  {post.deletedAt ? (
                    <Badge variant="destructive" className="font-normal">
                      deleted
                    </Badge>
                  ) : null}
                </div>
                <h3 className="mt-4 font-heading text-xl font-semibold tracking-tight text-foreground">
                  {post.title}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">/{post.slug}</p>
                {post.excerpt ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                ) : null}
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Updated {new Date(post.updatedAt).toLocaleDateString()}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/dashboard/content/blog/${post.id}`} />}
                >
                  Edit
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/15 px-5 py-10 text-center">
          <h3 className="font-heading text-lg font-semibold text-foreground">
            No articles yet
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a post to start building the blog.
          </p>
          <Button
            className="mt-5"
            nativeButton={false}
            render={<Link href="/dashboard/content/blog/new" />}
          >
            <PlusIcon className="size-4" />
            Add New Post
          </Button>
        </div>
      )}
    </div>
  );
}
