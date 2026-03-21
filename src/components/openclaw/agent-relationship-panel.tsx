import type { OpenClawRelationship } from "@/lib/openclaw/types";
import {
  formatRelationshipLabel,
  relationshipDetailText,
  resolveAgentEmoji,
  resolveAgentName,
} from "@/lib/openclaw/selectors";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function groupRelationships(
  relationships: OpenClawRelationship[],
): Record<string, OpenClawRelationship[]> {
  const groups: Record<string, OpenClawRelationship[]> = {
    delegates_to: [],
    supports: [],
    reports_to: [],
    works_with: [],
    specializes_for: [],
  };
  for (const r of relationships) {
    groups[r.type]?.push(r);
  }
  return groups;
}

const GROUP_ORDER = [
  "delegates_to",
  "supports",
  "reports_to",
  "works_with",
  "specializes_for",
] as const;

const GROUP_TITLES: Record<(typeof GROUP_ORDER)[number], string> = {
  delegates_to: "Delegation from Baggo",
  supports: "Support & shared context",
  reports_to: "Reporting & promotion",
  works_with: "Collaboration",
  specializes_for: "Specialization",
};

function AgentPairName({ agentId }: { agentId: string }) {
  const name = resolveAgentName(agentId);
  const emoji = resolveAgentEmoji(agentId);
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
      {emoji ? (
        <span aria-hidden className="text-base leading-none">
          {emoji}
        </span>
      ) : null}
      <span>{name}</span>
    </span>
  );
}

export function AgentRelationshipPanel({
  relationships,
}: {
  relationships: OpenClawRelationship[];
}) {
  const grouped = groupRelationships(relationships);

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-border/60">
        <CardTitle className="text-base">Hierarchy & relationships</CardTitle>
        <CardDescription>
          How Baggo delegates to specialists and how support agents sit adjacent
          to the core orchestrator. Sourced from{" "}
          <code className="text-xs">openclawRelationships</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {GROUP_ORDER.map((key) => {
          const items = grouped[key];
          if (!items?.length) return null;
          return (
            <div key={key}>
              <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {GROUP_TITLES[key]}
              </h3>
              <ul className="space-y-2">
                {items.map((r) => {
                  const detail = relationshipDetailText(r);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2"
                    >
                      <AgentPairName agentId={r.fromAgentId} />
                      <span className="text-xs text-muted-foreground sm:shrink-0">
                        {formatRelationshipLabel(r.type)}
                      </span>
                      <AgentPairName agentId={r.toAgentId} />
                      {detail ? (
                        <>
                          <Separator
                            orientation="vertical"
                            className="hidden h-4 sm:block"
                          />
                          <span className="text-xs text-muted-foreground sm:ml-auto sm:max-w-[55%] sm:text-right">
                            {detail}
                          </span>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
