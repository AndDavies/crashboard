import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Articles",
  description: "Articles on Crashboard.",
};

export default function ArticlesPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Articles
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Articles
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Longer essays separate from quick notes. Point this route at the same or
        a different source than Writing (<code className="rounded bg-muted px-1 py-0.5 text-sm">/blog</code>
        ).
      </p>
      <ul className="mt-12 divide-y divide-border/80 border-y border-border/80">
        <li className="py-8 text-center text-sm text-muted-foreground">
          No articles yet.
        </li>
      </ul>
    </MarketingPageFrame>
  );
}
