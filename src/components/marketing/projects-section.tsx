import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { featuredProjects } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";

const preview = featuredProjects.slice(0, 3);

export function ProjectsSection() {
  return (
    <SectionShell id="work" className="border-y border-border/70 bg-muted/25">
      <SectionHeading
        eyebrow="Work surface"
        title="Projects shaped as useful records, not portfolio theatre."
        description="Each section can become a case study, build log, or public summary as the site grows."
      />
      <div className="grid gap-px overflow-hidden border border-border/80 bg-border/80 md:grid-cols-3">
        {preview.map((project) => (
          <Link
            key={project.title}
            href={project.href ?? "/work"}
            className="group bg-background p-6 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-heading text-lg font-semibold text-foreground">
                {project.title}
              </h3>
              <ArrowUpRightIcon
                className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {project.stack.map((item) => (
                <span
                  key={item}
                  className="border border-border/80 bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}
