import type { Metadata } from "next";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { writingItems } from "@/lib/marketing/site-config";

export const metadata: Metadata = {
  title: "Articles",
  description: "Longer essays from Crashboard.",
};

export default function ArticlesPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Articles
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        Longer pieces with a clear argument.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        The article shelf is for more durable writing: a position, a trail of
        evidence, and a conclusion worth revisiting.
      </p>
      <div className="mt-14 divide-y divide-border/80 border-y border-border/80">
        {writingItems.map((item) => (
          <article key={item.title} className="grid gap-3 py-7 md:grid-cols-[12rem_1fr]">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              {item.section}
            </p>
            <div>
              <h2 className="font-heading text-lg font-semibold text-foreground">
                {item.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </MarketingPageFrame>
  );
}
