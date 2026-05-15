import Link from "next/link";
import { operatingNotes, siteConfig } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

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
              Crashboard currently has one real public content surface: the
              wiki. It is the compiled, browseable layer of source-backed notes
              and concept pages.
            </p>
            <p>
              The blog is being prepared as the next layer, but it should stay
              structurally honest until the CMS and actual posts exist.
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
