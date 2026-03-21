import type { OpenClawAgent } from "@/lib/openclaw/types";
import { AgentCard } from "@/components/openclaw/agent-card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function AgentGroupSection({
  title,
  description,
  agents,
  layout = "grid",
  cardClassName,
}: {
  title: string;
  description: string;
  agents: OpenClawAgent[];
  /** Support: single column for one support agent */
  layout?: "grid" | "single";
  cardClassName?: string;
}) {
  if (agents.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-heading text-sm font-semibold text-foreground">
            {title}
          </h3>
          <p className="max-w-2xl text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {agents.length} agent{agents.length === 1 ? "" : "s"}
        </span>
      </div>
      <Separator className="bg-border/60" />
      <div
        className={cn(
          layout === "grid" &&
            "grid gap-4 md:grid-cols-2 xl:grid-cols-2",
          layout === "single" && "max-w-xl",
        )}
      >
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            className={cardClassName}
          />
        ))}
      </div>
    </section>
  );
}
