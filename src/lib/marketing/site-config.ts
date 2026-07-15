export const siteConfig = {
  publicName: "Andrew Davies",
  title: "A public notebook on AI work, research systems, and strategic judgment.",
  shortBio:
    "I publish the parts of my working notes that are useful outside the notebook: AI workflows, source-backed research methods, knowledge-system design, and strategy writing from Halifax.",
  location: "Halifax, Canada",
  brandWordmark: "Crashboard",
} as const;

export type ProjectItem = {
  title: string;
  description: string;
  stack: string[];
  href?: string;
  label?: string;
};

export type HomeLink = {
  title: string;
  body: string;
  href: string;
  label: string;
};

export const homeLinks: HomeLink[] = [
  {
    title: "Trend intelligence",
    body: "Interactive, evidence-backed tracking of the topics, keywords, organizations, systems, and real-world actions moving across monitored coverage.",
    href: "/intelligence",
    label: "Explore trends",
  },
  {
    title: "Public wiki",
    body: "Compiled notes that have survived a second pass: concepts, workflows, source trails, and links between related ideas.",
    href: "/wiki",
    label: "Browse wiki",
  },
  {
    title: "Blog",
    body: "Longer field notes on using AI, organizing research, and turning loose judgment into reusable systems.",
    href: "/blog",
    label: "Open blog",
  },
  {
    title: "Research topics",
    body: "Durable hubs that connect recurring signals across the daily briefs and deeper wiki pages.",
    href: "/blog/topics",
    label: "Explore topics",
  },
];

export const operatingNotes = [
  "Name the question before publishing.",
  "Show the source trail when it matters.",
  "Prefer durable notes over daily takes.",
  "Keep operations private; make the synthesis public.",
];
