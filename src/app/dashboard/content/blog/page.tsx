import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { createBlogPostAction } from "@/lib/blog/actions";
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
      <section className="flex flex-col gap-4 rounded-xl border border-border/80 bg-muted/25 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            CMS
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
            Blog posts
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Create, edit, schedule, publish, archive, and delete public blog posts.
            Published posts feed the public /blog routes.
          </p>
        </div>
        <form action={createBlogPostAction} className="flex gap-2">
          <Input
            name="title"
            placeholder="New post title"
            className="min-w-0 sm:w-64"
          />
          <Button type="submit">
            <PlusIcon className="size-4" />
            New
          </Button>
        </form>
      </section>

      <form className="grid gap-3 rounded-xl border border-border/80 bg-background p-4 md:grid-cols-[1fr_12rem_auto]">
        <Input name="q" placeholder="Search posts" defaultValue={filters.q ?? ""} />
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

      <div className="divide-y divide-border/80 border-y border-border/80">
        {posts.length > 0 ? (
          posts.map((post) => (
            <Link
              key={post.id}
              href={`/dashboard/content/blog/${post.id}`}
              className="grid gap-4 py-5 outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[1fr_9rem_12rem]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    {post.title}
                  </h3>
                  {post.deletedAt ? (
                    <Badge variant="destructive" className="font-normal">
                      deleted
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">/{post.slug}</p>
                {post.excerpt ? (
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                ) : null}
              </div>
              <div>
                <Badge variant="outline" className="font-normal capitalize">
                  {post.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Updated {new Date(post.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))
        ) : (
          <div className="py-10 text-sm text-muted-foreground">
            No posts match this view.
          </div>
        )}
      </div>
    </div>
  );
}
