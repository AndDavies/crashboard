import Link from "next/link";
import { featuredProjects } from "@/lib/marketing/site-config";
import { SectionShell, SectionHeading } from "@/components/marketing/section-shell";
import { ProjectCard } from "@/components/marketing/project-card";
import { Button } from "@/components/ui/button";

const preview = featuredProjects.slice(0, 2);

export function ProjectsSection() {
  return (
    <SectionShell id="work" className="bg-background">
      <SectionHeading
        eyebrow="Work"
        title="Selected projects"
        description="Representative engagements — replace with your shipped work, case studies, or product links."
      />
      <div className="grid gap-6 md:grid-cols-2">
        {preview.map((project) => (
          <ProjectCard key={project.title} project={project} />
        ))}
      </div>
      <div className="mt-10">
        <Button
          nativeButton={false}
          variant="outline"
          size="default"
          render={<Link href="/work" />}
        >
          View all projects
        </Button>
      </div>
    </SectionShell>
  );
}
