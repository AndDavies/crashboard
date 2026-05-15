export const siteConfig = {
  publicName: "Andrew Davies",
  title: "Personal website, public wiki, and research blog",
  shortBio:
    "I use Crashboard as the public edge of my working system: a place for source-backed wiki pages, AI workflow notes, knowledge-system thinking, and longer strategy writing.",
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
    body: "The live body of compiled pages: concepts, workflows, source-backed synthesis, and links between ideas.",
    href: "/wiki",
    label: "Browse wiki",
  },
  {
    title: "Blog",
    body: "Essays and field notes on AI workflows, practical research systems, defence strategy, and how ideas turn into working surfaces.",
    href: "/blog",
    label: "Open blog",
  },
  {
    title: "Private dashboard",
    body: "The authenticated side of Crashboard for private notes, tools, ingestion, and working surfaces.",
    href: "/dashboard",
    label: "Go to dashboard",
  },
];

export const operatingNotes = [
  "Public pages should link somewhere real.",
  "The wiki carries the current content surface.",
  "The blog should answer one clear question at a time.",
  "The CMS should make publishing citeable without becoming heavy.",
];

export const blogPosts: BlogPostSummary[] = [];

export const blogContentModel = [
  {
    field: "Title and slug",
    description: "The public URL, page title, and social preview title.",
  },
  {
    field: "Summary",
    description: "A short answer and meta description for readers, search snippets, and answer systems.",
  },
  {
    field: "Status",
    description: "Draft, review, or published state before the post appears.",
  },
  {
    field: "Body",
    description: "The article content, eventually stored as rich text or MDX.",
  },
  {
    field: "Tags",
    description: "Topic labels and focus terms that connect posts back to wiki clusters.",
  },
  {
    field: "Sources and related pages",
    description: "References to supporting URLs and related wiki pages for context and citation.",
  },
];
