import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Content",
  description: "Public content sections for Crashboard.",
};

export default function ContentPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Content
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        Public shelves for material that is useful outside the dashboard.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Essays, articles, links, and project records each have their own lane so
        the archive can grow without losing shape.
      </p>
    </MarketingPageFrame>
  );
}
