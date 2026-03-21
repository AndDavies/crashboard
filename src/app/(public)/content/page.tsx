import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Content",
  description: "Public content sections for Crashboard.",
};

export default function ContentPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Content
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Content
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Use this area for evergreen pages: about-adjacent detail, policies, or
        curated collections. This route is unchanged for backwards
        compatibility — link it from the footer if you still need it.
      </p>
    </MarketingPageFrame>
  );
}
