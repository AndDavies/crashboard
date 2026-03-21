import type { OpenClawProject } from "@/lib/openclaw/types";
import { getProjectAgents } from "@/lib/openclaw/selectors";
import { LinkedAgentBadges } from "@/components/openclaw/linked-agent-badges";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const statusTone: Record<
  OpenClawProject["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  active: "default",
  planning: "secondary",
  maintenance: "outline",
  archived: "outline",
};

export function ProjectCard({ project }: { project: OpenClawProject }) {
  const agents = getProjectAgents(project);

  return (
    <Card className="h-full shadow-none transition-shadow hover:shadow-sm">
      <CardHeader className="border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base leading-snug">{project.name}</CardTitle>
            <CardDescription className="text-xs">
              {project.category}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Badge variant={statusTone[project.status]} className="capitalize">
              {project.status}
            </Badge>
            <Badge variant="outline" className="max-w-56 truncate font-normal">
              {project.stage.replace(/-/g, " ")}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {project.summary}
        </p>
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Linked agents
          </p>
          <LinkedAgentBadges agents={agents} />
        </div>
        {project.tags.length > 0 ? (
          <>
            <Separator className="bg-border/60" />
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-border/80 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </>
        ) : null}
        {project.notes.length > 0 ? (
          <>
            <Separator className="bg-border/60" />
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Notes
              </p>
              <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                {project.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
