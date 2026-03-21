import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-widest text-foreground/50">
          Personal site
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Crashboard
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-foreground/70">
          A public home for your writing, reading list, and notes — with a
          private dashboard when you sign in.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/blog"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Read the blog
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-foreground/5"
          >
            Sign in to dashboard
          </Link>
        </div>
      </section>
      <section className="grid gap-4 border-t border-foreground/10 pt-10 sm:grid-cols-2">
        {[
          {
            href: "/content",
            title: "Content",
            body: "Long-form pages and static sections you want front and center.",
          },
          {
            href: "/articles",
            title: "Articles",
            body: "Essays and deep dives — wire this to CMS or MDX when you are ready.",
          },
          {
            href: "/links",
            title: "Links",
            body: "Bookmarks, tools, and things worth sharing.",
          },
          {
            href: "/dashboard",
            title: "Dashboard",
            body: "Signed-in space for drafts, stats, or anything you keep private.",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-xl border border-foreground/10 bg-foreground/[0.02] p-5 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]"
          >
            <h2 className="text-base font-semibold text-foreground group-hover:underline">
              {item.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/65">
              {item.body}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
