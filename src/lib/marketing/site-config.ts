export const siteConfig = {
  publicName: "Andrew Davies",
  title: "Personal website, field notes, and useful project work",
  shortBio:
    "I write and build around product judgment, research systems, operating rhythm, and practical software. Crashboard is the public edge of that work.",
  email: "hello@example.com",
  location: "Halifax, Canada",
  social: {
    github: "https://github.com",
    linkedin: "https://linkedin.com",
  },
  brandWordmark: "Crashboard",
} as const;

export type ProjectItem = {
  title: string;
  description: string;
  stack: string[];
  href?: string;
  label?: string;
};

export type WritingItem = {
  title: string;
  description: string;
  section: string;
  status: string;
  href?: string;
};

export type SectionScaffold = {
  title: string;
  description: string;
  slots: string[];
};

export const featuredProjects: ProjectItem[] = [
  {
    title: "Crashboard",
    description:
      "A private dashboard and public writing surface for collecting useful signals, shaping decisions, and keeping personal systems accountable.",
    stack: ["Next.js", "Supabase", "Personal OS"],
    href: "/work",
    label: "Project notes",
  },
  {
    title: "Knowledge Base workflows",
    description:
      "Editorial systems for turning rough captures into readable synthesis, source-backed pages, and repeatable review loops.",
    stack: ["Obsidian", "Research", "LLM workflows"],
    href: "/work",
    label: "Workflow",
  },
  {
    title: "Market intelligence briefs",
    description:
      "Evidence-led research packages that separate durable opportunity signals from noise, wishful thinking, and generic aggregation.",
    stack: ["Research", "Strategy", "Writing"],
    href: "/work",
    label: "Brief format",
  },
];

export const capabilityBlocks = [
  {
    title: "Research into judgment",
    body: "Turn scattered notes, source material, and market signals into decisions that can survive scrutiny.",
  },
  {
    title: "Products with operating discipline",
    body: "Shape tools around actual workflows: what gets reviewed, who acts, and what evidence changes the next move.",
  },
  {
    title: "Writing that earns its keep",
    body: "Publish notes that clarify a position, expose tradeoffs, and make future work easier instead of adding noise.",
  },
  {
    title: "Systems that stay usable",
    body: "Keep the mechanics plain: strong defaults, clear sections, useful empty states, and room to grow.",
  },
];

export const signalBlocks = [
  {
    title: "What I am thinking through",
    body: "Personal operating systems, AI-assisted research, better briefing formats, and how small teams make cleaner decisions.",
  },
  {
    title: "What I am building",
    body: "Crashboard as a home base for private dashboards, public notes, project records, and selective writing.",
  },
  {
    title: "What belongs here next",
    body: "A tighter archive of essays, working notes, useful links, and project pages that can be expanded without redesigning the site.",
  },
];

export const writingItems: WritingItem[] = [
  {
    title: "How to tell whether a tool is actually helping",
    description:
      "A practical note on signal, friction, and whether a workflow deserves to survive contact with daily use.",
    section: "Product judgment",
    status: "Draft slot",
    href: "/blog",
  },
  {
    title: "The difference between capture and knowledge",
    description:
      "Notes on why compiled information often feels flat, and what makes a knowledge base worth reading later.",
    section: "Knowledge work",
    status: "Draft slot",
    href: "/blog",
  },
  {
    title: "Small dashboards, better decisions",
    description:
      "A working thesis for dashboards that act like review surfaces rather than decorative analytics walls.",
    section: "Systems",
    status: "Draft slot",
    href: "/blog",
  },
];

export const blogScaffolds: SectionScaffold[] = [
  {
    title: "Essays",
    description:
      "Longer pieces with a clear argument, source trail, and durable point of view.",
    slots: ["Product judgment", "AI workflows", "Knowledge systems"],
  },
  {
    title: "Field notes",
    description:
      "Shorter observations from projects, experiments, tools, and recurring workflow problems.",
    slots: ["Build logs", "Decision notes", "Retrospectives"],
  },
  {
    title: "References",
    description:
      "Curated links, reading notes, and source packets that are useful enough to keep public.",
    slots: ["Reading list", "Tool notes", "Research packets"],
  },
];
