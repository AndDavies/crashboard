import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description: `About ${siteConfig.publicName} and ${siteConfig.brandWordmark}.`,
};

const principles = [
  "Make the evidence visible enough that a decision can be challenged.",
  "Keep systems boring until boring stops working.",
  "Write in a way that helps the next pass start smarter.",
  "Treat dashboards as review surfaces, not decoration.",
];

export default function AboutPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        About
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        A personal site for the public parts of Crashboard.
      </h1>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_22rem]">
        <div className="max-w-3xl space-y-6 text-base leading-relaxed text-muted-foreground">
          <p>{siteConfig.shortBio}</p>
          <p>
            The through-line is practical judgment: separating signal from
            noise, preserving useful source trails, and turning rough thinking
            into pages that can be revisited.
          </p>
          <p>
            Today, the wiki is the real public corpus. The blog is the next
            publishing surface, and it should stay clean until the CMS can feed
            it real posts.
          </p>
        </div>
        <aside className="border-l border-border/80 pl-6">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Principles
          </p>
          <ul className="mt-4 space-y-4">
            {principles.map((principle) => (
              <li
                key={principle}
                className="text-sm leading-relaxed text-foreground"
              >
                {principle}
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/blog" />}>
          Read writing
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/wiki" />}
        >
          Browse wiki
        </Button>
      </div>
    </MarketingPageFrame>
  );
}
