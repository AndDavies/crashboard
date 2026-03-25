import {
  openclawAgents,
  openclawProjects,
  openclawRelationships,
} from "@/lib/openclaw/data";
import type {
  OpenClawAgent,
  OpenClawAgentKind,
  OpenClawProject,
  OpenClawRelationship,
  OpenClawRelationshipType,
  OpenClawSnapshotStats,
} from "@/lib/openclaw/types";

export function getOpenClawSnapshotStats(): OpenClawSnapshotStats {
  return {
    totalAgents: openclawAgents.length,
    specialistAgents: openclawAgents.filter((a) => a.kind === "specialist").length,
    supportAgents: openclawAgents.filter((a) => a.kind === "support").length,
    orchestrators: openclawAgents.filter((a) => a.kind === "orchestrator").length,
    totalProjects: openclawProjects.length,
    activeProjects: openclawProjects.filter((p) => p.status === "active").length,
  };
}

export function getOpenClawAgentById(id: string): OpenClawAgent | undefined {
  return openclawAgents.find((a) => a.id === id);
}

export function getOpenClawAgentsByKind(
  kind: OpenClawAgentKind,
): OpenClawAgent[] {
  return openclawAgents.filter((a) => a.kind === kind);
}

/** Primary orchestrator (Baggo). */
export function getOpenClawMainOrchestrator(): OpenClawAgent | undefined {
  return openclawAgents.find((a) => a.kind === "orchestrator");
}

export function getOpenClawSpecialists(): OpenClawAgent[] {
  return getOpenClawAgentsByKind("specialist");
}

export function getOpenClawSupportAgents(): OpenClawAgent[] {
  return getOpenClawAgentsByKind("support");
}

export function getAgentsDelegatedFrom(fromAgentId: string): OpenClawAgent[] {
  const ids = openclawRelationships
    .filter(
      (r) => r.fromAgentId === fromAgentId && r.type === "delegates_to",
    )
    .map((r) => r.toAgentId);
  return ids
    .map((id) => getOpenClawAgentById(id))
    .filter((a): a is OpenClawAgent => Boolean(a));
}

export function getOpenClawRelationships(): OpenClawRelationship[] {
  return openclawRelationships;
}

export function getRelationshipsInvolvingAgent(
  agentId: string,
): OpenClawRelationship[] {
  return openclawRelationships.filter(
    (r) => r.fromAgentId === agentId || r.toAgentId === agentId,
  );
}

const RELATIONSHIP_LABELS: Record<OpenClawRelationshipType, string> = {
  delegates_to: "Delegates to",
  supports: "Supports",
  reports_to: "Reports to",
  works_with: "Works with",
  specializes_for: "Specializes for",
};

export function formatRelationshipLabel(
  type: OpenClawRelationshipType,
): string {
  return RELATIONSHIP_LABELS[type];
}

export function relationshipDetailText(r: OpenClawRelationship): string {
  return r.label ?? r.note ?? "";
}

export function resolveAgentName(id: string): string {
  return getOpenClawAgentById(id)?.name ?? id;
}

export function resolveAgentEmoji(id: string): string {
  return getOpenClawAgentById(id)?.emoji ?? "";
}

export function getOpenClawProjects(): OpenClawProject[] {
  return openclawProjects;
}

export function getProjectAgents(
  project: OpenClawProject,
): OpenClawAgent[] {
  return project.linkedAgentIds
    .map((id) => getOpenClawAgentById(id))
    .filter((a): a is OpenClawAgent => Boolean(a));
}

/** Cross-page summary: snapshot stats + relationship count. */
export function getOpenClawSummaryStats() {
  return {
    ...getOpenClawSnapshotStats(),
    relationshipCount: openclawRelationships.length,
  };
}
