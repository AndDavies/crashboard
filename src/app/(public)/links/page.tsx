import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Links",
  description: "Curated links from Crashboard.",
};

const linkSections = [
  "Reading worth returning to",
  "Tools and workflows",
  "Research sources",
];

export default function LinksPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Links
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        A small public shelf for sources and references.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        Links belong here when they are useful enough to keep in public and
        specific enough to make future writing stronger.
      </p>
      <div className="mt-14 grid gap-px overflow-hidden border border-border/80 bg-border/80 md:grid-cols-3">
        {linkSections.map((section) => (
          <section key={section} className="bg-background p-6">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              {section}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Add the first entries when there is a source worth exposing here.
            </p>
          </section>
        ))}
      </div>
    </MarketingPageFrame>
  );
}
