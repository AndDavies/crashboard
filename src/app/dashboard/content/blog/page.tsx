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
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-foreground">
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

      <form className="grid gap-3 border border-border/80 bg-card p-4 md:grid-cols-[1fr_12rem_auto]">
        <Input name="q" placeholder="Search articles" defaultValue={filters.q ?? ""} />
        <select
          name="status"
          defaultValue={filters.status ?? "all"}
          className="h-8 border border-border/80 bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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

      <section className="border border-border/80 bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="eyebrow">Templates</p>
            <h3 className="mt-2 font-heading text-xl font-semibold text-foreground">
              Starter drafts
            </h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Answer-shaped post templates drawn from the strongest wiki
              clusters. Open one, edit it, then save or publish through the CMS.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-px border border-border/80 bg-border/80 lg:grid-cols-3">
          {blogStarterPosts.map((starter) => (
            <Link
              key={starter.id}
              href={`/dashboard/content/blog/new?starter=${encodeURIComponent(starter.id)}`}
              className="group flex flex-col bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <Badge variant="outline" className="font-normal">
                {starter.focusTopic}
              </Badge>
              <h4 className="mt-3 font-heading text-base font-semibold leading-tight text-foreground">
                {starter.title}
              </h4>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                {starter.answerSummary}
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent">
                Use template
                <ArrowRightIcon
                  className="size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {posts.length > 0 ? (
        <div className="grid gap-px border border-border/80 bg-border/80 md:grid-cols-2">
          {posts.map((post) => (
            <article
              key={post.id}
              className="flex min-h-56 flex-col justify-between bg-card p-5"
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
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  /{post.slug}
                </p>
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
