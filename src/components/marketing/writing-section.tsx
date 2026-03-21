import Link from "next/link";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";
import { Button } from "@/components/ui/button";

const placeholders = [
  {
    title: "Designing for trust in internal tools",
    date: "Coming soon",
  },
  {
    title: "Notes on shipping with Next.js and Supabase",
    date: "Coming soon",
  },
];

export function WritingSection() {
  return (
    <SectionShell id="writing" className="bg-background">
      <SectionHeading
        eyebrow="Writing"
        title="Latest notes"
        description="Longer-form thinking on product, frontend craft, and how teams work. Wire /blog to MDX or your CMS when ready."
      />
      <ul className="divide-y divide-border/80 border-y border-border/80">
        {placeholders.map((post) => (
          <li key={post.title} className="flex flex-col gap-1 py-6 sm:flex-row sm:items-baseline sm:justify-between">
            <span className="font-medium text-foreground">{post.title}</span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {post.date}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/blog" />}
        >
          Open writing archive
        </Button>
      </div>
    </SectionShell>
  );
}
