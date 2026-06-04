import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { SectionShell } from "@/components/marketing/section-shell";

export function ContactSection() {
  return (
    <SectionShell
      id="next"
      className="border-b-0 bg-foreground text-background"
    >
      <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <p className="mb-4 flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-background/55">
            <span className="h-1 w-10 bg-accent" aria-hidden />
            Next
          </p>
          <h2 className="font-heading text-4xl leading-[1.02] font-semibold tracking-[-0.01em] text-background md:text-6xl">
            Start with the material that already has weight.
          </h2>
          <span
            className="mt-6 inline-block h-[0.4rem] w-[7rem] bg-accent"
            aria-hidden
          />
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-background/65 md:text-lg">
            The wiki is live now. The blog will follow as the CMS starts
            publishing real essays, not filler.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/wiki"
            className="group inline-flex items-center justify-between gap-3 border border-accent bg-accent px-5 py-3 text-sm font-semibold tracking-tight text-accent-foreground motion-safe:transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
          >
            Public wiki
            <ArrowRightIcon
              className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
          <Link
            href="/blog"
            className="group inline-flex items-center justify-between gap-3 border border-background/40 bg-transparent px-5 py-3 text-sm font-semibold tracking-tight text-background motion-safe:transition-colors hover:border-background hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Open blog
            <ArrowRightIcon
              className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    </SectionShell>
  );
}
