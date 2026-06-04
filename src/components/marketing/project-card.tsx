import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import type { ProjectItem } from "@/lib/marketing/site-config";
import { Badge } from "@/components/ui/badge";

export function ProjectCard({ project }: { project: ProjectItem }) {
  const isExternal = Boolean(project.href && /^https?:\/\//.test(project.href));
  const Icon = isExternal ? ArrowUpRightIcon : ArrowRightIcon;

  const card = (
    <article className="flex h-full flex-col border border-border/80 bg-card/70 motion-safe:transition-colors group-hover:bg-card group-focus-visible:bg-card group-focus-visible:ring-2 group-focus-visible:ring-ring">
      <header className="border-b border-border/80 p-5">
        <h3 className="font-heading text-xl font-semibold leading-tight text-foreground">
          {project.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {project.description}
        </p>
      </header>
      <div className="flex-1 p-5">
        <div className="flex flex-wrap gap-1.5">
          {project.stack.map((tech) => (
            <Badge key={tech} variant="outline" className="font-normal">
              {tech}
            </Badge>
          ))}
        </div>
      </div>
      {project.href ? (
        <footer className="flex items-center justify-between border-t border-border/80 px-5 py-3 text-accent motion-safe:transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
          <span className="text-sm font-semibold tracking-tight">
            {project.label ?? "Open"}
          </span>
          <Icon
            className="size-4 motion-safe:transition-transform motion-safe:group-hover:translate-x-1"
            aria-hidden
          />
        </footer>
      ) : null}
    </article>
  );

  if (project.href) {
    return (
      <Link href={project.href} className="group block h-full outline-none">
        {card}
      </Link>
    );
  }

  return card;
}
