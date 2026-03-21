import Link from "next/link";
import type { ProjectItem } from "@/lib/marketing/site-config";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRightIcon } from "lucide-react";

export function ProjectCard({ project }: { project: ProjectItem }) {
  const card = (
    <Card className="h-full transition-shadow duration-200 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
      <CardHeader className="border-b border-border/60">
        <CardTitle>{project.title}</CardTitle>
        <CardDescription>{project.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex flex-wrap gap-1.5">
          {project.stack.map((tech) => (
            <Badge key={tech} variant="secondary" className="font-normal">
              {tech}
            </Badge>
          ))}
        </div>
      </CardContent>
      {project.href ? (
        <CardFooter className="border-t border-border/60">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
            {project.label ?? "Open"}
            <ArrowUpRightIcon className="size-3.5 opacity-60" aria-hidden />
          </span>
        </CardFooter>
      ) : null}
    </Card>
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
