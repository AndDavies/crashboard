import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { getDashboardBlogPosts } from "@/lib/blog/data";
import { blogStarterPosts } from "@/lib/blog/starter-posts";
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
          <p className="eyebrow">CMS</p>
          <h2 className="mt-2 font-heading text-4xl font-semibold tracking-tight text-foreground">
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

      <form className="grid gap-3 border-y border-foreground/80 py-4 md:grid-cols-[1fr_12rem_auto]">
        <Input name="q" placeholder="Search articles" defaultValue={filters.q ?? ""} />
        <select
          name="status"
          defaultValue={filters.status ?? "all"}
          className="h-10 border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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

      <details className="disclosure border-b border-border/80">
        <summary>
          <span>Starter drafts <span className="ml-2 font-normal text-muted-foreground">({blogStarterPosts.length})</span></span>
        </summary>
        <p className="max-w-2xl pb-4 text-sm leading-relaxed text-muted-foreground">
          Answer-shaped post templates drawn from the strongest wiki clusters.
          Open one, edit it, then save or publish through the CMS.
        </p>
        <div className="divide-y divide-border/80 border-y border-border/80">
          {blogStarterPosts.map((starter) => (
            <Link
              key={starter.id}
              href={`/dashboard/content/blog/new?starter=${encodeURIComponent(starter.id)}`}
              className="group grid gap-3 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-center"
            >
              <Badge variant="outline" className="w-fit rounded-none font-normal">
                {starter.focusTopic}
              </Badge>
              <span>
                <span className="block font-heading text-lg font-semibold leading-tight text-foreground">{starter.title}</span>
                <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted-foreground">{starter.answerSummary}</span>
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                Use template
                <ArrowRightIcon
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          ))}
        </div>
      </details>

      {posts.length > 0 ? (
        <section className="border-y border-foreground/80">
          <div className="hidden grid-cols-[minmax(16rem,1fr)_8rem_9rem_7rem] gap-4 border-b border-border/80 py-3 md:grid">
            <span className="eyebrow">Article</span>
            <span className="eyebrow">Status</span>
            <span className="eyebrow">Updated</span>
            <span className="eyebrow text-right">Action</span>
          </div>
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/dashboard/content/blog/${post.id}`}
              className="group grid gap-4 border-b border-border/80 py-5 last:border-b-0 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(16rem,1fr)_8rem_9rem_7rem] md:items-center"
            >
              <span className="min-w-0">
                <span className="block font-heading text-xl font-semibold tracking-tight text-foreground">{post.title}</span>
                <span className="mt-1 block font-mono text-xs text-muted-foreground">/{post.slug}</span>
                {post.excerpt ? <span className="mt-2 line-clamp-2 block text-sm leading-relaxed text-muted-foreground md:hidden">{post.excerpt}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-normal capitalize">
                    {post.status}
                  </Badge>
                  {post.deletedAt ? (
                    <Badge variant="destructive" className="font-normal">
                      deleted
                    </Badge>
                  ) : null}
              </span>
              <span className="text-sm text-muted-foreground">{new Date(post.updatedAt).toLocaleDateString()}</span>
              <span className="inline-flex items-center justify-end gap-2 text-sm font-semibold text-foreground">Edit <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" aria-hidden /></span>
            </Link>
          ))}
        </section>
      ) : (
        <div className="border border-dashed border-border/80 bg-muted/15 px-5 py-10 text-center">
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
