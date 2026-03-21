import type {
  OpenClawAgent,
  OpenClawProject,
  OpenClawRelationship,
  OpenClawSnapshotStats,
} from "@/lib/openclaw/types";

/**
 * Current OpenClaw snapshot — edit agents, relationships, projects, and stats here.
 * Pages and components read through `selectors.ts`.
 */
export const openclawStats: OpenClawSnapshotStats = {
  totalAgents: 6,
  specialistAgents: 4,
  supportAgents: 1,
  orchestrators: 1,
  totalProjects: 3,
  activeProjects: 3,
};

export const openclawAgents: OpenClawAgent[] = [
  {
    id: "main",
    name: "Baggo",
    emoji: "🐾",
    kind: "orchestrator",
    role: "Primary assistant and orchestrator",
    description:
      "Main OpenClaw agent for Andrew. Handles direct requests, routes work to specialists, maintains workspace context, and coordinates project work.",
    capabilities: [
      "general assistance",
      "task orchestration",
      "project coordination",
      "workspace context management",
      "delegation to specialists",
    ],
    workspace: "~/.openclaw/workspace",
    agentDir: "~/.openclaw/agents/main/agent",
    model: "openai-codex/gpt-5.4",
    channelScope: ["telegram"],
    status: "active",
    tier: "core",
    group: "orchestration",
    notes: [
      "Acts as Andrew’s main agent",
      "Can delegate to Sally, Tobi, Sam, and Riley",
    ],
  },
  {
    id: "daily-brief",
    name: "Daily Brief",
    emoji: "📰",
    kind: "support",
    role: "Periodic briefing and summary agent",
    description:
      "Support agent intended for daily summaries, briefings, and lightweight periodic updates.",
    capabilities: [
      "daily briefings",
      "summaries",
      "status aggregation",
    ],
    workspace: "~/.openclaw/workspace",
    agentDir: "~/.openclaw/agents/daily-brief/agent",
    model: "openai-codex/gpt-5.4",
    status: "active",
    tier: "support",
    group: "operations",
    notes: [
      "Uses the main workspace",
      "Not currently part of the named specialist delegation set",
    ],
  },
  {
    id: "sally",
    name: "Sally",
    emoji: "📊",
    kind: "specialist",
    role: "Market research specialist",
    description:
      "Dedicated agent for market research, niche analysis, whitespace mapping, competitor landscape work, JTBD analysis, and idea validation.",
    capabilities: [
      "market research",
      "niche selection",
      "competitor analysis",
      "JTBD analysis",
      "idea validation",
      "whitespace mapping",
    ],
    workspace: "~/.openclaw/workspace-sally",
    agentDir: "~/.openclaw/agents/sally/agent",
    model: "openai-codex/gpt-5.4",
    status: "active",
    tier: "specialist",
    group: "research-strategy",
    notes: [
      "Primary market-analysis agent",
      "Use for substantial research tasks in strategy and market selection",
    ],
  },
  {
    id: "tobi",
    name: "Tobi",
    emoji: "🚀",
    kind: "specialist",
    role: "Founder/operator and execution specialist",
    description:
      "Dedicated agent for business plans, GTM plans, MVP planning, operating plans, launch sequencing, and monetization strategy.",
    capabilities: [
      "business planning",
      "go-to-market planning",
      "execution roadmaps",
      "MVP planning",
      "operating plans",
      "monetization strategy",
    ],
    workspace: "~/.openclaw/workspace-tobi",
    agentDir: "~/.openclaw/agents/tobi/agent",
    model: "openai-codex/gpt-5.4",
    status: "active",
    tier: "specialist",
    group: "business-execution",
    notes: [
      "Best for turning ideas into executable business plans",
    ],
  },
  {
    id: "sam",
    name: "Sam",
    emoji: "🔎",
    kind: "specialist",
    role: "Deep research specialist",
    description:
      "Dedicated research agent for source gathering, evidence mapping, broad scans, topic exploration, and research support for later analysis.",
    capabilities: [
      "deep research",
      "source gathering",
      "evidence mapping",
      "framework scans",
      "topic exploration",
    ],
    workspace: "~/.openclaw/workspace-sam",
    agentDir: "~/.openclaw/agents/sam/agent",
    model: "openai-codex/gpt-5.4",
    status: "active",
    tier: "specialist",
    group: "research-evidence",
    notes: [
      "Best for broad evidence collection before synthesis or planning",
    ],
  },
  {
    id: "riley",
    name: "Riley",
    emoji: "🎨",
    kind: "specialist",
    role: "Web design and frontend architecture specialist",
    description:
      "Dedicated agent for website architecture, sitemap design, landing pages, UI systems, and React/Next.js website design.",
    capabilities: [
      "web design",
      "information architecture",
      "sitemap design",
      "landing pages",
      "design systems",
      "React",
      "Next.js",
      "dashboard UX",
    ],
    workspace: "~/.openclaw/workspace-riley",
    agentDir: "~/.openclaw/agents/riley/agent",
    model: "openai-codex/gpt-5.4",
    status: "active",
    tier: "specialist",
    group: "design-frontend",
    notes: [
      "Recently added as the dedicated web-design specialist",
      "Installed skills include SuperDesign, design-system-creation, tailwind-design-system, and sovereign-accessibility-auditor",
    ],
  },
];

export const openclawRelationships: OpenClawRelationship[] = [
  {
    id: "main-manages-sally",
    fromAgentId: "main",
    toAgentId: "sally",
    type: "delegates_to",
    label: "Delegates market research work",
  },
  {
    id: "main-manages-tobi",
    fromAgentId: "main",
    toAgentId: "tobi",
    type: "delegates_to",
    label: "Delegates business planning and execution work",
  },
  {
    id: "main-manages-sam",
    fromAgentId: "main",
    toAgentId: "sam",
    type: "delegates_to",
    label: "Delegates deep research and source gathering",
  },
  {
    id: "main-manages-riley",
    fromAgentId: "main",
    toAgentId: "riley",
    type: "delegates_to",
    label: "Delegates web design and frontend architecture work",
  },
  {
    id: "main-supports-daily-brief",
    fromAgentId: "main",
    toAgentId: "daily-brief",
    type: "supports",
    label: "Shared workspace / support function",
  },
];

export const openclawProjects: OpenClawProject[] = [
  {
    id: "crashboard",
    name: "Crashboard",
    status: "active",
    stage: "architecture-and-design",
    category: "personal website + dashboard",
    summary:
      "Andrew’s personal website and private authenticated dashboard project, built with Next.js, Tailwind, shadcn/ui, and Supabase auth.",
    tags: [
      "nextjs",
      "dashboard",
      "supabase",
      "personal-site",
      "shadcn",
      "react",
    ],
    linkedAgentIds: ["main", "riley"],
    notes: [
      "Public + private split is intentional",
      "Existing Supabase auth must be preserved",
      "Current design direction is minimalist and professional",
    ],
  },
  {
    id: "ai-governance-readiness",
    name: "AI Governance / Readiness",
    status: "active",
    stage: "post-research-pre-build",
    category: "content-led venture",
    summary:
      "A content-led venture around AI planning, governance, trust, maturity, and data strategy. Market analysis and execution plan are complete.",
    tags: [
      "ai",
      "governance",
      "readiness",
      "trust",
      "content",
      "strategy",
    ],
    linkedAgentIds: ["main", "sally", "tobi", "sam"],
    notes: [
      "Project is currently unnamed",
      "Ready for flagship asset design, site architecture, and first content work",
    ],
  },
  {
    id: "wags-and-wanders",
    name: "Wags and Wanders",
    status: "active",
    stage: "validated-idea",
    category: "niche business concept",
    summary:
      "A narrow, high-trust dog travel planning concept focused on helping owners plan international travel with dogs without missing legal or airline requirements.",
    tags: [
      "dog-travel",
      "validation",
      "planning",
      "travel-intelligence",
      "niche-market",
    ],
    linkedAgentIds: ["main", "sally", "tobi"],
    notes: [
      "Preliminary market validation completed",
      "Ready for more structured project work, data strategy, and eventual build planning",
    ],
  },
];
