import type { Metadata } from "next";
import { OpenClawSectionHeader } from "@/components/openclaw/openclaw-section-header";
import { OpenClawSummaryStats } from "@/components/openclaw/openclaw-summary-stats";
import { ProjectCard } from "@/components/openclaw/project-card";
import {
  getOpenClawProjects,
  getOpenClawSummaryStats,
} from "@/lib/openclaw/selectors";

export const metadata: Metadata = {
  title: "OpenClaw · Projects",
  description: "Projects linked to OpenClaw agents and workspaces.",
};

export default function OpenClawProjectsPage() {
  const projects = getOpenClawProjects();
  const stats = getOpenClawSummaryStats();

  return (
    <div className="space-y-10">
      <OpenClawSectionHeader
        title="Projects"
        description="Active workstreams tied to Baggo and the current specialist roster. Projects render from typed config and automatically resolve their linked agents via `linkedAgentIds`."
      />

      <OpenClawSummaryStats
        stats={[
          { label: "Projects", value: stats.totalProjects },
          {
            label: "Active",
            value: stats.activeProjects,
            hint: "status = active",
          },
          { label: "Agents in roster", value: stats.totalAgents },
          {
            label: "Specialists",
            value: stats.specialistAgents,
          },
          {
            label: "Relationship edges",
            value: stats.relationshipCount,
            hint: "Delegation + support",
          },
          {
            label: "Orchestrators",
            value: stats.orchestrators,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
