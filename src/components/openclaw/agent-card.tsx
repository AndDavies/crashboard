import type { OpenClawAgent } from "@/lib/openclaw/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const variantAccent: Record<OpenClawAgent["kind"], string> = {
  orchestrator: "border-l-[3px] border-l-foreground/35",
  specialist: "border-l-[3px] border-l-primary/45",
  support:
    "border-l-[3px] border-l-dashed border-l-muted-foreground/50",
};

const statusVariant: Record<
  OpenClawAgent["status"],
  "default" | "secondary" | "outline"
> = {
  active: "default",
  paused: "secondary",
  experimental: "outline",
};

const kindLabel: Record<OpenClawAgent["kind"], string> = {
  orchestrator: "Orchestrator",
  specialist: "Specialist",
  support: "Support",
};

export function AgentCard({
  agent,
  className,
}: {
  agent: OpenClawAgent;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "h-full shadow-none transition-shadow hover:shadow-sm",
        variantAccent[agent.kind],
        className,
      )}
    >
      <CardHeader className="border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <span className="text-lg leading-none" aria-hidden>
              {agent.emoji}
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-base">{agent.name}</CardTitle>
              <CardDescription className="text-xs font-medium text-muted-foreground">
                {agent.role}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Badge variant="outline" className="font-normal capitalize">
              {kindLabel[agent.kind]}
            </Badge>
            <Badge variant={statusVariant[agent.status]} className="capitalize">
              {agent.status}
            </Badge>
          </div>
        </div>
        <div className="pt-2">
          <span className="inline-flex rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {agent.group}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {agent.description}
        </p>
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Capabilities
          </p>
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.map((c) => (
              <Badge key={c} variant="secondary" className="font-normal">
                {c}
              </Badge>
            ))}
          </div>
        </div>
        {agent.tags && agent.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {agent.tags.map((t) => (
              <span
                key={t}
                className="rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
        <Separator className="bg-border/60" />
        <dl className="grid gap-2 text-xs">
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="font-mono text-[11px] text-foreground">{agent.model}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">
              {agent.workspace}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground">Agent dir</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">
              {agent.agentDir}
            </dd>
          </div>
          {agent.channelScope && agent.channelScope.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Channels</dt>
              <dd className="text-foreground">{agent.channelScope.join(", ")}</dd>
            </div>
          ) : null}
        </dl>
        {agent.notes.length > 0 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              Notes
            </p>
            <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
              {agent.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
