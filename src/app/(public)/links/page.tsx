export const metadata = {
  title: "Links · Crashboard",
  description: "Curated links from Crashboard.",
};

export default function LinksPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Links</h1>
      <p className="max-w-2xl text-foreground/70">
        A running list of tools, reads, and references. Populate from static
        data or your database when you are ready.
      </p>
      <ul className="mt-8 space-y-2 text-sm">
        <li className="rounded-lg border border-foreground/10 px-4 py-3 text-foreground/55">
          Add your first link here.
        </li>
      </ul>
    </div>
  );
}
