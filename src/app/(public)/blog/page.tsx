export const metadata = {
  title: "Blog · Crashboard",
  description: "Blog posts from Crashboard.",
};

export default function BlogPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Blog</h1>
      <p className="max-w-2xl text-foreground/70">
        Post list will live here — e.g. MDX files, a CMS, or Supabase-backed
        entries. For now this route is ready for your data layer.
      </p>
      <ul className="mt-8 space-y-3 text-sm text-foreground/55">
        <li className="rounded-lg border border-dashed border-foreground/15 px-4 py-6 text-center">
          No posts yet.
        </li>
      </ul>
    </div>
  );
}
