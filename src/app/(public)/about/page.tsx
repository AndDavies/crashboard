import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Button } from "@/components/ui/button";
import { canonicalUrl } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Andrew Davies, Crashboard, and the public notebook behind his AI workflow, research-system, and strategy writing.",
  alternates: { canonical: canonicalUrl("/about") },
};

const principles = [
  "Write from evidence, not posture.",
  "Give readers the trail: sources, decisions, and caveats.",
  "Make the wiki useful before making the blog busy.",
  "Build tools that improve judgment, not dashboards that decorate it.",
];

export default function AboutPage() {
  return (
    <MarketingPageFrame>
      <p className="flex items-center gap-3 font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
        <span className="h-1 w-10 bg-accent" aria-hidden />
        About
      </p>
      <h1 className="mt-8 max-w-4xl font-heading text-5xl leading-[0.98] font-light tracking-[-0.02em] text-foreground md:text-7xl">
        I use Crashboard to turn private research into public working notes.
      </h1>
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_22rem]">
        <div className="max-w-3xl space-y-6 text-base leading-relaxed text-muted-foreground md:text-lg">
          <p>
            I am Andrew Davies, based in Halifax. I work on practical AI
            workflows, research systems, defence and strategy questions, and
            the knowledge infrastructure that holds those threads together.
          </p>
          <p>
            Crashboard is where finished-enough thinking leaves the private
            notebook: source-backed wiki pages first, then essays when a
            question deserves a longer answer.
          </p>
          <p>
            Most of the raw material stays private. What appears here should
            help a reader understand the question, follow the evidence, and
            reuse the pattern.
          </p>
        </div>
        <aside className="border-t border-border/80 pt-6 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Principles
          </p>
          <ul className="mt-5 divide-y divide-border/80 border-y border-border/80">
            {principles.map((principle) => (
              <li
                key={principle}
                className="py-3 text-sm leading-relaxed text-foreground"
              >
                {principle}
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <div className="mt-12 flex flex-wrap gap-3">
        <Button
          nativeButton={false}
          className="rounded-full bg-accent px-5 text-accent-foreground hover:bg-accent/85"
          render={<Link href="/blog" />}
        >
          Read writing
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          className="rounded-full border-foreground/15 px-5"
          render={<Link href="/wiki" />}
        >
          Browse wiki
        </Button>
      </div>
    </MarketingPageFrame>
  );
}
