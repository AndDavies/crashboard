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

export type BlogPostSummary = {
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published";
  publishedAt?: string;
  readingMinutes?: number;
  tags: string[];
};

export const homeLinks: HomeLink[] = [
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
    title: "Private dashboard",
    body: "The private side for drafts, ingestion, and the machinery behind the public pages.",
    href: "/dashboard",
    label: "Go to dashboard",
  },
];

export const operatingNotes = [
  "Name the question before publishing.",
  "Show the source trail when it matters.",
  "Prefer durable notes over daily takes.",
  "Keep the dashboard private; make the synthesis public.",
];

export const blogPosts: BlogPostSummary[] = [];

export const blogContentModel = [
  {
    field: "Title and slug",
    description: "The public handle for a post: clear enough to cite and stable enough to keep.",
  },
  {
    field: "Summary",
    description: "The answer a reader should understand before deciding whether to read the whole piece.",
  },
  {
    field: "Status",
    description: "Draft, scheduled, published, or archived without exposing unfinished work.",
  },
  {
    field: "Body",
    description: "The argument, examples, caveats, and source trail in a format that can be edited cleanly.",
  },
  {
    field: "Tags",
    description: "Topic labels that connect essays back to the wiki instead of becoming loose keywords.",
  },
  {
    field: "Sources and related pages",
    description: "Supporting links and wiki pages that make the post easier to verify, reuse, and extend.",
  },
];
