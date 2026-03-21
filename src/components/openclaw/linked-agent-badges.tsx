import type { OpenClawAgent } from "@/lib/openclaw/types";
import { Badge } from "@/components/ui/badge";

export function LinkedAgentBadges({
  agents,
  emptyLabel = "None linked",
}: {
  agents: OpenClawAgent[];
  emptyLabel?: string;
}) {
  if (agents.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">{emptyLabel}</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {agents.map((a) => (
        <Badge
          key={a.id}
          variant="secondary"
          className="max-w-full gap-1 font-normal"
          title={a.role}
        >
          <span aria-hidden className="shrink-0">
            {a.emoji}
          </span>
          <span className="truncate">{a.name}</span>
        </Badge>
      ))}
    </div>
  );
}
