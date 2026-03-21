import type { Metadata } from "next";
import { OpenClawSectionHeader } from "@/components/openclaw/openclaw-section-header";
import { OpenClawSummaryStats } from "@/components/openclaw/openclaw-summary-stats";
import { AgentGroupSection } from "@/components/openclaw/agent-group-section";
import { AgentRelationshipPanel } from "@/components/openclaw/agent-relationship-panel";
import { OrchestratorHeroPanel } from "@/components/openclaw/orchestrator-hero-panel";
import {
  getAgentsDelegatedFrom,
  getOpenClawMainOrchestrator,
  getOpenClawRelationships,
  getOpenClawSnapshotStats,
  getOpenClawSpecialists,
  getOpenClawSupportAgents,
} from "@/lib/openclaw/selectors";

export const metadata: Metadata = {
  title: "OpenClaw · Agents",
  description: "OpenClaw agent roster: Baggo, specialists, support, and relationships.",
};

export default function OpenClawAgentsPage() {
  const snapshot = getOpenClawSnapshotStats();
  const main = getOpenClawMainOrchestrator();
  const specialists = getOpenClawSpecialists();
  const support = getOpenClawSupportAgents();
  const relationships = getOpenClawRelationships();
  const delegated =
    main != null ? getAgentsDelegatedFrom(main.id) : [];

  return (
    <div className="space-y-10">
      <OpenClawSectionHeader
        title="Agents"
        description="Live view of your OpenClaw setup: Baggo as the central orchestrator, four specialists for research and execution, and Daily Brief for operational summaries. All copy and structure come from typed config."
      />

      <OpenClawSummaryStats
        stats={[
          { label: "Total agents", value: snapshot.totalAgents },
          { label: "Orchestrators", value: snapshot.orchestrators, hint: "Baggo" },
          {
            label: "Specialists",
            value: snapshot.specialistAgents,
            hint: "Delegated lane",
          },
          {
            label: "Support / ops",
            value: snapshot.supportAgents,
            hint: "Non-delegation lane",
          },
          { label: "Projects", value: snapshot.totalProjects },
          {
            label: "Active projects",
            value: snapshot.activeProjects,
          },
        ]}
      />

      {main ? (
        <OrchestratorHeroPanel
          agent={main}
          delegatedSpecialists={delegated}
        />
      ) : null}

      <AgentGroupSection
        title="Specialist agents"
        description="Domain experts Baggo delegates to for market research, planning, deep research, and product UI."
        agents={specialists}
      />

      <AgentGroupSection
        title="Support & operations"
        description="Adjacent to the orchestrator — periodic briefings and lightweight updates, visually distinct from the specialist grid."
        agents={support}
        layout="single"
      />

      <AgentRelationshipPanel relationships={relationships} />
    </div>
  );
}
