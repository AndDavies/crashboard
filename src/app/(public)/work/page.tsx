import type { Metadata } from "next";
import Link from "next/link";
import { featuredProjects } from "@/lib/marketing/site-config";
import { MarketingPageFrame } from "@/components/marketing/page-frame";
import { ProjectCard } from "@/components/marketing/project-card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Work",
  description: "Selected projects and case studies.",
};

export default function WorkPage() {
  return (
    <MarketingPageFrame>
      <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
        Work
      </p>
      <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
        Selected projects
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Replace placeholders with real outcomes, metrics, and links. Each card
        can point to a live product, case study, or repo.
      </p>
      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {featuredProjects.map((project) => (
          <ProjectCard key={project.title} project={project} />
        ))}
      </div>
      <div className="mt-14 border-t border-border/80 pt-10">
        <p className="text-sm text-muted-foreground">
          Interested in something similar?
        </p>
        <Button
          nativeButton={false}
          className="mt-4"
          render={<Link href="/contact" />}
        >
          Start a conversation
        </Button>
      </div>
    </MarketingPageFrame>
  );
}
