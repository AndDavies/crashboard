import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Writing",
  description: "Notes and articles — MDX, CMS, or Supabase-backed posts.",
};

export default function BlogPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Writing
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Archive
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Longer-form pieces will live here. Connect MDX, a headless CMS, or
        Supabase when you are ready to publish.
      </p>
      <ul className="mt-12 divide-y divide-border/80 border-y border-border/80">
        <li className="py-8 text-center text-sm text-muted-foreground">
          No posts yet.
        </li>
      </ul>
      <div className="mt-10">
        <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
          ← Back home
        </Button>
      </div>
    </MarketingPageFrame>
  );
}
