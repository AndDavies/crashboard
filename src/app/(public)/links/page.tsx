import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Links",
  description: "Curated links from Crashboard.",
};

export default function LinksPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Links
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Links
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Bookmarks, tools, and references worth sharing.
      </p>
      <ul className="mt-12 space-y-2">
        <li className="rounded-lg border border-border/80 bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
          Add your first link here.
        </li>
      </ul>
    </MarketingPageFrame>
  );
}
