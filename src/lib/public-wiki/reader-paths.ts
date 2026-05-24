import type { PublicWikiIndex, PublicWikiIndexPage } from "@/lib/public-wiki/types";

export type WikiReaderPath = {
  id: string;
  title: string;
  promise: string;
  description: string;
  primarySlug: string;
  supportingSlugs: string[];
};

export const wikiReaderPaths: WikiReaderPath[] = [
  {
    id: "ai-workflows",
    title: "Build Better AI Workflows",
    promise: "See how repeatable work can use AI without losing control.",
    description:
      "Start with workflow design, agent execution, evaluation, and the handoffs that keep automated work inspectable.",
    primarySlug: "ai-automation-builders",
    supportingSlugs: [
      "agent-execution-systems",
      "coding-agent-workflows",
      "agent-evaluation-and-verification",
    ],
  },
  {
    id: "agent-memory",
    title: "Design Agent Memory",
    promise: "Understand what context should persist and what should disappear.",
    description:
      "Follow the pages on memory, context compaction, persistent threads, and the boundaries around durable agent knowledge.",
    primarySlug: "agent-memory-and-context-systems",
    supportingSlugs: ["llm-memory", "context-compaction", "persistent-agent-threads"],
  },
  {
    id: "public-synthesis",
    title: "Turn Notes into Public Synthesis",
    promise: "Use private evidence to produce public, source-backed pages.",
    description:
      "Read how raw captures become useful synthesis, public knowledge systems, and reusable research artifacts.",
    primarySlug: "compiled-knowledge-systems",
    supportingSlugs: [
      "personal-knowledge-systems",
      "second-brain-systems",
      "ai-assisted-content-systems",
    ],
  },
  {
    id: "venture-judgment",
    title: "Find Venture and Workflow Opportunities",
    promise: "Look for repeated pain, workflow gaps, and practical openings.",
    description:
      "Explore judgment, demand signals, workflow friction, and small wedges where AI changes the economics of work.",
    primarySlug: "venture-opportunity-discovery",
    supportingSlugs: [
      "judgment-venture-and-human-systems",
      "persuasion-and-demand-creation",
      "ai-native-organizations",
    ],
  },
  {
    id: "trust-boundaries",
    title: "Understand AI Trust Boundaries",
    promise: "Separate useful autonomy from unsafe or unverifiable behavior.",
    description:
      "Start with assurance, safety, privacy, control, and the boundary design needed for serious AI systems.",
    primarySlug: "trust-boundaries-and-assurance",
    supportingSlugs: [
      "ai-safety-and-control",
      "privacy-engineering-for-ai-systems",
      "cybersecurity-boundaries",
    ],
  },
];

const clusterLabels: Record<string, string> = {
  "ai-software": "AI, Agents & Software",
  assurance: "Trust, Assurance & Boundaries",
  "canada-policy": "Canada, Sovereignty & Public Policy",
  communication: "Communication, Persuasion & Taste",
  foundations: "Start Here",
  health: "Life, Health & Energy",
  judgment: "Legacy Judgment Hub",
  "knowledge-learning": "Knowledge, Learning & Publishing",
  "leadership-work": "Work & Operating Systems",
  money: "Money, Wealth & Markets",
  navigation: "Operational Navigation",
  "self-meaning": "Philosophy, Self & Meaning",
  venture: "Business, Venture & Money",
};

const clusterOrder = [
  "navigation",
  "health",
  "leadership-work",
  "venture",
  "money",
  "canada-policy",
  "ai-software",
  "knowledge-learning",
  "communication",
  "self-meaning",
  "assurance",
  "judgment",
  "foundations",
];

export function clusterLabel(cluster: string) {
  if (clusterLabels[cluster]) return clusterLabels[cluster];
  return cluster
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function sortClustersForReaders(index: PublicWikiIndex) {
  return index.clusters.toSorted((a, b) => {
    const aIndex = clusterOrder.indexOf(a.id);
    const bIndex = clusterOrder.indexOf(b.id);
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return clusterLabel(a.label).localeCompare(clusterLabel(b.label));
  });
}

export function getReaderPathPages(
  path: WikiReaderPath,
  pages: PublicWikiIndexPage[],
) {
  const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
  return [path.primarySlug, ...path.supportingSlugs]
    .map((slug) => pageBySlug.get(slug))
    .filter((page): page is PublicWikiIndexPage => Boolean(page));
}

export function getReaderPathPrimaryPage(
  path: WikiReaderPath,
  pages: PublicWikiIndexPage[],
) {
  return pages.find((page) => page.slug === path.primarySlug) ?? null;
}

export function getReaderPathSlugs(paths = wikiReaderPaths) {
  return Array.from(
    new Set(paths.flatMap((path) => [path.primarySlug, ...path.supportingSlugs])),
  );
}
