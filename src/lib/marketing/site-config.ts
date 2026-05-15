export const siteConfig = {
  publicName: "Andrew Davies",
  title: "Personal website, public wiki, and future blog",
  shortBio:
    "I use Crashboard as the public edge of my working system: a place for source-backed wiki pages now, and longer writing once the publishing workflow is ready.",
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
    body: "The future publishing surface for essays and field notes. The route is ready for dynamic content; the CMS comes next.",
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
  "The blog should stay empty until posts exist.",
  "The CMS should feed the blog without another redesign.",
];

export const blogPosts: BlogPostSummary[] = [];

export const blogContentModel = [
  {
    field: "Title and slug",
    description: "The public URL, page title, and social preview title.",
  },
  {
    field: "Summary",
    description: "A short description for archive cards, metadata, and feeds.",
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
    description: "Topic labels that connect posts back to wiki clusters.",
  },
  {
    field: "Canonical links",
    description: "References to related wiki pages, source notes, or external URLs.",
  },
];
