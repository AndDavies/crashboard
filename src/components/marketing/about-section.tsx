import Link from "next/link";
import { siteConfig } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

const operatingNotes = [
  "Prefer evidence over enthusiasm.",
  "Keep the workflow small enough to use.",
  "Write the decision, not just the summary.",
  "Preserve the source trail.",
];

export function AboutSection() {
  return (
    <SectionShell id="about" className="bg-background">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          <SectionHeading
            eyebrow="Personal site"
            title="A quieter home base for the work behind the work."
            description={siteConfig.title}
          />
          <div className="max-w-3xl space-y-5 text-base leading-relaxed text-muted-foreground">
            <p>
              Crashboard is where I want the public layer of my work to live:
              writing, projects, useful links, and the occasional field note
              from tools or workflows that are worth keeping.
            </p>
            <p>
              The style direction borrows from intelligence briefs: clear
              sections, plain labels, source-aware claims, and enough visual
              restraint that the writing can carry the page.
            </p>
          </div>
        </div>

        <aside className="border-l border-border/80 pl-6">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Operating posture
          </p>
          <ul className="mt-4 space-y-3">
            {operatingNotes.map((note) => (
              <li key={note} className="text-sm leading-relaxed text-foreground">
                {note}
              </li>
            ))}
          </ul>
          <Link
            href="/about"
            className="mt-6 inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Read the fuller profile
          </Link>
        </aside>
      </div>
    </SectionShell>
  );
}
