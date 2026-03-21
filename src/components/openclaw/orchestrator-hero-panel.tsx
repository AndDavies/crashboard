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
import { LinkedAgentBadges } from "@/components/openclaw/linked-agent-badges";

export function OrchestratorHeroPanel({
  agent,
  delegatedSpecialists,
}: {
  agent: OpenClawAgent;
  delegatedSpecialists: OpenClawAgent[];
}) {
  return (
    <Card className="overflow-hidden border-border/80 shadow-none ring-1 ring-border/40">
      <CardHeader className="border-b border-border/60 bg-muted/30 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-2xl"
              aria-hidden
            >
              {agent.emoji}
            </span>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{agent.name}</CardTitle>
                <Badge>Central orchestrator</Badge>
                <Badge variant="secondary" className="font-normal capitalize">
                  {agent.status}
                </Badge>
              </div>
              <CardDescription className="text-sm font-medium text-foreground/90">
                {agent.role}
              </CardDescription>
            </div>
          </div>
          <div className="text-xs text-muted-foreground sm:text-right">
            <p className="font-medium text-foreground/80">{agent.group}</p>
            <p className="mt-0.5 tabular-nums">{agent.model}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {agent.description}
        </p>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Capabilities
          </p>
          <div className="flex flex-wrap gap-1.5">
            {agent.capabilities.map((c) => (
              <Badge key={c} variant="outline" className="font-normal">
                {c}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Delegated specialists
          </p>
          <LinkedAgentBadges agents={delegatedSpecialists} />
        </div>

        <Separator className="bg-border/60" />

        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="mt-0.5 font-mono text-[11px] text-foreground">
              {agent.workspace}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Agent directory</dt>
            <dd className="mt-0.5 font-mono text-[11px] text-foreground">
              {agent.agentDir}
            </dd>
          </div>
          {agent.channelScope && agent.channelScope.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Channel scope</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {agent.channelScope.map((ch) => (
                  <Badge key={ch} variant="secondary" className="font-normal">
                    {ch}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>

        {agent.notes.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Notes
            </p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
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
