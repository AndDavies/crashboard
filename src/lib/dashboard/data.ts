import { Activity, Bot, BookOpenText, Database, FolderKanban, Settings, Sparkles, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DashboardMetric = {
  label: string;
  value: string;
  hint: string;
};

export type DashboardLinkItem = {
  title: string;
  description: string;
  href: string;
};

export type DashboardSection = {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
  items: DashboardLinkItem[];
};

export const dashboardOverviewMetrics: DashboardMetric[] = [
  {
    label: "Implementation home",
    value: "Crashboard",
    hint: "Next.js app + private dashboard",
  },
  {
    label: "Product focus",
    value: "Repository first",
    hint: "Knowledgebase / semantic layer follows later",
  },
  {
    label: "Primary capture path",
    value: "Telegram → Leroy",
    hint: "Structured ingestion into Supabase/Postgres",
  },
  {
    label: "Connected surfaces",
    value: "OpenClaw + WHOOP",
    hint: "Agent ops live now; WHOOP OAuth is wired",
  },
];

export const dashboardOverviewSections: DashboardSection[] = [
  {
    title: "Personal Knowledgebase",
    description:
      "The current product shift is toward a private repository for captured content, with retrieval and ask workflows layered on later.",
    icon: BookOpenText,
    badge: "Current priority",
    items: [
      {
        title: "Repository UI",
        description:
          "Dashboard pages should evolve into inbox, library, filters, source detail, and review flows for saved documents.",
        href: "/dashboard/content/notes",
      },
      {
        title: "Ingestion pipeline",
        description:
          "Telegram capture, Leroy extraction, structured payloads, and document-first persistence are the active implementation path.",
        href: "/dashboard/tools/automations",
      },
    ],
  },
  {
    title: "OpenClaw operations",
    description:
      "Agent topology and linked workstreams are already represented as typed dashboard views and remain part of the private operating surface.",
    icon: Bot,
    items: [
      {
        title: "Agent roster",
        description:
          "Baggo orchestrates specialist agents for research, planning, frontend work, and operational support.",
        href: "/dashboard/openclaw/agents",
      },
      {
        title: "Linked projects",
        description:
          "Crashboard and adjacent projects are tied to agents, stages, and execution notes.",
        href: "/dashboard/openclaw/projects",
      },
    ],
  },
  {
    title: "Integrations and account surfaces",
    description:
      "WHOOP and Supabase-backed auth/settings stay lightweight for now, but the dashboard should clearly show what is live versus planned.",
    icon: Activity,
    items: [
      {
        title: "WHOOP connection",
        description:
          "OAuth is wired and the dashboard should frame recovery, sleep, and strain as the next data surfaces.",
        href: "/dashboard/whoop",
      },
      {
        title: "Preferences",
        description:
          "Environment, auth, and route-level defaults belong under settings without overbuilding account tooling.",
        href: "/dashboard/settings",
      },
    ],
  },
];

export const dashboardContentSections: DashboardSection[] = [
  {
    title: "Repository views",
    description:
      "Content now maps to repository and knowledgebase work rather than generic writing placeholders.",
    icon: BookOpenText,
    items: [
      {
        title: "Library / inbox",
        description:
          "Saved articles, PDFs, YouTube transcripts, and X captures should land in a browsable private corpus.",
          href: "/dashboard/content/notes",
        },
      {
        title: "Review queue",
        description:
          "Draft and triage states should support inbox → reviewed workflows before publishing or retrieval layers exist.",
          href: "/dashboard/content/drafts",
        },
      {
        title: "Publishing / export",
        description:
          "Publishing is now best framed as shipping processed knowledge or curated writing out of the repository.",
          href: "/dashboard/content/publishing",
        },
    ],
  },
];

export const dashboardToolSections: DashboardSection[] = [
  {
    title: "Automations",
    description:
      "Scheduled ingestion, webhook entry points, and background processing are core app infrastructure now.",
    icon: Workflow,
    items: [
      {
        title: "Capture orchestration",
        description:
          "Telegram topic messages trigger extraction and structured ingestion via OpenClaw helpers and Leroy.",
        href: "/dashboard/tools/automations",
      },
      {
        title: "Ingestion endpoints",
        description:
          "Structured and legacy ingestion routes live in the app and should stay visible as operational surfaces.",
        href: "/dashboard/tools/utilities",
      },
    ],
  },
  {
    title: "Experiments",
    description:
      "RAG, chunking, embeddings, and retrieval ranking remain explicitly later-phase work.",
    icon: Sparkles,
    items: [
      {
        title: "Knowledgebase layer",
        description:
          "Semantic search and ask experiences should build on top of the repository once the corpus and metadata are stable.",
        href: "/dashboard/tools/experiments",
      },
    ],
  },
];

export const dashboardProjectSections: DashboardSection[] = [
  {
    title: "Crashboard",
    description:
      "The app is both a personal site and the private control surface for ingestion, OpenClaw operations, and future knowledge workflows.",
    icon: FolderKanban,
    badge: "Active",
    items: [
      {
        title: "Public + private split",
        description:
          "Marketing/public pages stay separate from authenticated dashboard tools and repository surfaces.",
        href: "/dashboard/projects/crashboard",
      },
      {
        title: "Current implementation focus",
        description:
          "Repository backend and dashboard views are more important right now than broad new feature expansion.",
        href: "/dashboard/content/notes",
      },
    ],
  },
  {
    title: "Adjacent workstreams",
    description:
      "Other projects are still tracked here, but the dashboard should anchor them to real execution context instead of generic scratch-space copy.",
    icon: Database,
    items: [
      {
        title: "AI Governance / Readiness",
        description:
          "Research and execution planning are complete; next steps move into site architecture and flagship asset design.",
        href: "/dashboard/openclaw/projects",
      },
      {
        title: "Wags and Wanders",
        description:
          "Validated concept work remains visible as a future structured project, not just an untyped placeholder.",
        href: "/dashboard/openclaw/projects",
      },
    ],
  },
];

export const dashboardSettingsSections: DashboardSection[] = [
  {
    title: "Environment and auth",
    description:
      "Settings should reflect the actual moving pieces already in the app: Supabase auth, redirects, integrations, and private dashboard behavior.",
    icon: Settings,
    items: [
      {
        title: "Supabase auth",
        description:
          "Dashboard access is gated through the server-side Supabase client and authenticated layout shell.",
        href: "/dashboard/settings",
      },
      {
        title: "Integration configuration",
        description:
          "WHOOP OAuth, ingestion endpoints, and site URLs are the important environment-backed settings today.",
        href: "/dashboard/whoop",
      },
    ],
  },
];

export const dashboardWhoopSections: DashboardSection[] = [
  {
    title: "WHOOP status",
    description:
      "Connection is real; the metric pages are still scaffolds waiting for data-fetch and visualization work.",
    icon: Activity,
    items: [
      {
        title: "Recovery",
        description:
          "Frame recovery as readiness, HRV context, and rest guidance once WHOOP data ingestion is added.",
        href: "/dashboard/whoop/recovery",
      },
      {
        title: "Sleep",
        description:
          "Track sleep performance, staging, consistency, and trends in a future pass.",
        href: "/dashboard/whoop/sleep",
      },
      {
        title: "Strain",
        description:
          "Reserve this route for day strain, workout context, and load progression once the API layer exists.",
        href: "/dashboard/whoop/strain",
      },
    ],
  },
];

export const dashboardActiveWorkstream = [
  "Document-first repository model in Supabase/Postgres",
  "Telegram hashtag preservation as user tags",
  "Leroy-generated summaries and keyword enrichment",
  "Repository UI before chunking and embeddings",
];

export const dashboardRouteNotes = {
  notes:
    "Treat this route as the future inbox/library entry point for captured knowledge, not a generic note pad.",
  drafts:
    "Use this route for triage, review state, and incomplete processing rather than editorial draft management alone.",
  publishing:
    "Publishing should connect repository material to public outputs, exported notes, or curated summaries.",
  automations:
    "Operational focus: ingestion triggers, webhook handlers, and scheduled processing.",
  utilities:
    "Operational focus: endpoints, validators, schema helpers, and low-level tooling that supports ingestion and auth.",
  experiments:
    "Exploration focus: chunking, embeddings, retrieval, reranking, and future knowledgebase UX.",
};

export const dashboardImplementationBullets = [
  "Next.js App Router with server-component dashboard pages",
  "Supabase auth in the dashboard layout",
  "Typed config-driven OpenClaw views",
  "Minimalist card-based UI using existing shared components",
];

export const dashboardRecentChanges = [
  "Crashboard is the implementation home for the Personal Knowledgebase.",
  "The old ingestion/backend schema is being discarded for a simpler document-first model.",
  "Repository usefulness now takes priority over embeddings and semantic retrieval.",
  "Telegram capture + Leroy enrichment is the current ingestion direction.",
];

export const dashboardOpsLinks: DashboardLinkItem[] = [
  {
    title: "OpenClaw agents",
    description: "Inspect current orchestrator and specialist structure.",
    href: "/dashboard/openclaw/agents",
  },
  {
    title: "OpenClaw projects",
    description: "Review linked projects, stages, and agent coverage.",
    href: "/dashboard/openclaw/projects",
  },
  {
    title: "WHOOP",
    description: "Check connection status and future health data surfaces.",
    href: "/dashboard/whoop",
  },
  {
    title: "Settings",
    description: "Review auth and environment-backed configuration surfaces.",
    href: "/dashboard/settings",
  },
];

export const dashboardSystemSurfaces = [
  { label: "OpenClaw", value: "Agent orchestration" },
  { label: "Supabase", value: "Auth + database" },
  { label: "WHOOP", value: "OAuth integration" },
  { label: "Repository", value: "Current product buildout" },
];

export const dashboardProjectFootnotes = [
  "Keep the public site and private dashboard responsibilities clearly separated.",
  "Prefer typed config/data and server-rendered composition over ad hoc client state.",
  "Do not rewrite unrelated surfaces while expanding the dashboard.",
];
