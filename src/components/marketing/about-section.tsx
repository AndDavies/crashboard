import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { operatingNotes, siteConfig } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

export function AboutSection() {
  return (
    <SectionShell id="about">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Personal site"
            title="A public notebook for the work that survives the first draft."
            description={siteConfig.title}
          />
          <div className="max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground md:text-lg">
            <p>
              Crashboard is where finished-enough thinking leaves the private
              notebook. The wiki holds the current corpus: source-backed pages,
              recurring concepts, and the connective tissue between them.
            </p>
            <p>
              The blog is for questions that need a fuller answer than a wiki
              page can carry: how a workflow works, what a source trail proves,
              and where the judgment is still uncertain.
            </p>
          </div>
        </div>

        <aside className="border border-border/80 bg-card/70 p-6 lg:sticky lg:top-24 lg:self-start">
          <p className="eyebrow">Operating posture</p>
          <ul className="mt-5 grid gap-px border border-border/80 bg-border/80">
            {operatingNotes.map((note) => (
              <li
                key={note}
                className="bg-card/70 px-4 py-3 text-sm leading-relaxed text-foreground"
              >
                {note}
              </li>
            ))}
          </ul>
          <Link
            href="/about"
            className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-accent underline decoration-accent/40 decoration-2 underline-offset-4 hover:decoration-accent"
          >
            Read the fuller profile
            <ArrowRightIcon
              className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
              aria-hidden
            />
          </Link>
        </aside>
      </div>
    </SectionShell>
  );
}
