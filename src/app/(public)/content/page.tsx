export const metadata = {
  title: "Content · Crashboard",
  description: "Public content sections for Crashboard.",
};

export default function ContentPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">Content</h1>
      <p className="max-w-2xl text-foreground/70">
        Use this area for evergreen pages: about, projects, or curated
        collections. Replace this copy when you connect real content.
      </p>
    </div>
  );
}
