import type { Metadata } from "next";
import Link from "next/link";
import { featuredProjects } from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Work",
  description: "Selected projects and working records from Crashboard.",
};

export default function WorkPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Work
      </p>
      <h1 className="mt-4 max-w-3xl font-heading text-4xl font-semibold text-foreground md:text-5xl md:leading-[1.08]">
        Project records for tools, workflows, and research systems.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
        This page can grow into case studies, build logs, and public project
        memos. The current structure keeps each item legible before the archive
        gets larger.
      </p>
      <div className="mt-14 divide-y divide-border/80 border-y border-border/80">
        {featuredProjects.map((project) => (
          <article
            key={project.title}
            className="grid gap-5 py-8 md:grid-cols-[16rem_1fr_auto]"
          >
            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">
                {project.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {project.label ?? "Project"}
              </p>
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {project.description}
            </p>
            <div className="flex flex-wrap content-start gap-2">
              {project.stack.map((item) => (
                <span
                  key={item}
                  className="border border-border/80 bg-muted/35 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
      <div className="mt-14 border-t border-border/80 pt-10">
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          The strongest project pages should explain the decision context, the
          operating constraint, what changed, and what still needs scrutiny.
        </p>
        <Button
          nativeButton={false}
          className="mt-5"
          render={<Link href="/contact" />}
        >
          Start a conversation
        </Button>
      </div>
    </MarketingPageFrame>
  );
}
