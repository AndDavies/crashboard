/** Functional role: orchestration vs execution vs ops support. */
export type OpenClawAgentKind = "orchestrator" | "specialist" | "support";

/** Display tier / lane in the dashboard (Baggo = core). */
export type OpenClawAgentTier = "core" | "specialist" | "support";

export type OpenClawAgentStatus = "active" | "paused" | "experimental";

export type OpenClawAgent = {
  id: string;
  name: string;
  emoji: string;
  kind: OpenClawAgentKind;
  role: string;
  description: string;
  capabilities: string[];
  workspace: string;
  agentDir: string;
  model: string;
  channelScope?: string[];
  status: OpenClawAgentStatus;
  tier: OpenClawAgentTier;
  /** Domain / squad label for grouping indicators */
  group: string;
  notes: string[];
  tags?: string[];
};

export type OpenClawRelationshipType =
  | "delegates_to"
  | "supports"
  | "reports_to"
  | "works_with"
  | "specializes_for";

export type OpenClawRelationship = {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: OpenClawRelationshipType;
  /** Human-readable line for the dashboard */
  label?: string;
  note?: string;
};

export type OpenClawProjectStatus =
  | "planning"
  | "active"
  | "maintenance"
  | "archived";

export type OpenClawProject = {
  id: string;
  name: string;
  status: OpenClawProjectStatus;
  stage: string;
  category: string;
  summary: string;
  tags: string[];
  linkedAgentIds: string[];
  notes: string[];
};

/** Authoritative snapshot for summary stat cards (keep in sync when editing data). */
export type OpenClawSnapshotStats = {
  totalAgents: number;
  specialistAgents: number;
  supportAgents: number;
  orchestrators: number;
  totalProjects: number;
  activeProjects: number;
};
