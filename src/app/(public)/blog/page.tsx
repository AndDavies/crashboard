import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import {
  blogScaffolds,
  siteConfig,
  writingItems,
} from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";

export const metadata: Metadata = {
  title: "Writing",
  description:
    "Essays, field notes, and references from Andrew Davies and Crashboard.",
};

export default function BlogPage() {
  return (
    <MarketingPageFrame className="py-0">
      <section className="grid gap-10 border-b border-border/80 py-14 md:grid-cols-[1fr_26rem] md:py-20">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Writing
          </p>
          <h1 className="mt-4 font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
            Notes for decisions, systems, and practical judgment.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Essays with arguments, field notes from the work, and references
            worth keeping public.
          </p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden border border-border/80 md:aspect-auto">
          <Image
            src="/images/marketing/crashboard-writing.png"
            alt="Desk with notes, cards, and writing materials"
            fill
            sizes="(min-width: 768px) 26rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
      </section>

      <section className="grid gap-8 border-b border-border/80 py-12 md:grid-cols-3">
        {blogScaffolds.map((section) => (
          <article key={section.title} className="border-t border-border/80 pt-5">
            <h2 className="font-heading text-xl font-semibold text-foreground">
              {section.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {section.description}
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {section.slots.map((slot) => (
                <li
                  key={slot}
                  className="border border-border/80 bg-muted/35 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {slot}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="py-14 md:py-20">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Draft queue
            </p>
            <h2 className="mt-2 font-heading text-2xl font-semibold text-foreground">
              First slots to fill
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Early topics for the archive, grouped by the kind of work they are
            meant to clarify.
          </p>
        </div>

        <div className="divide-y divide-border/80 border-y border-border/80">
          {writingItems.map((post) => (
            <Link
              key={post.title}
              href={post.href ?? "/blog"}
              className="group grid gap-4 py-6 outline-none hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[11rem_1fr_auto]"
            >
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                {post.section}
              </div>
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  {post.title}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {post.description}
                </p>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                {post.status}
                <ArrowRightIcon
                  className="mt-0.5 size-4 transition-transform group-hover:translate-x-1"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-border/80 py-12">
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {siteConfig.brandWordmark} keeps public writing readable on its own:
          clear enough for a first pass, specific enough to reward a return.
        </p>
      </section>
    </MarketingPageFrame>
  );
}
