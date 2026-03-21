export const metadata = {
  title: "Articles · Crashboard",
  description: "Articles on Crashboard.",
};

export default function ArticlesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Articles</h1>
      <p className="max-w-2xl text-foreground/70">
        Longer pieces separate from quick blog updates. Hook this route to the
        same or a different source than <code className="text-foreground">/blog</code>.
      </p>
      <ul className="mt-8 space-y-3 text-sm text-foreground/55">
        <li className="rounded-lg border border-dashed border-foreground/15 px-4 py-6 text-center">
          No articles yet.
        </li>
      </ul>
    </div>
  );
}
