import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "About",
  description: `About ${siteConfig.publicName} — ${siteConfig.title}.`,
};

export default function AboutPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        About
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        {siteConfig.publicName}
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        {siteConfig.title}
      </p>
      <Separator className="my-10 max-w-md" />
      <div className="max-w-2xl space-y-6 text-base leading-relaxed text-muted-foreground">
        <p>{siteConfig.shortBio}</p>
        <p>
          I care about the unglamorous parts: empty states, error handling,
          keyboard paths, and the documentation that keeps a system honest. If
          that resonates, we’ll probably work well together.
        </p>
        <p>
          Outside of client work, I write about tools, teams, and the interface
          between design and engineering — see{" "}
          <Link
            href="/blog"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Writing
          </Link>
          .
        </p>
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/contact" />}>
          Contact
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/work" />}
        >
          View work
        </Button>
      </div>
    </MarketingPageFrame>
  );
}
