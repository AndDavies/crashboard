export type PublicWikiChart = {
  id: string;
  title: string;
  headers: string[];
  labels: string[];
  values: number[];
};

export type PublicWikiPage = {
  slug: string;
  title: string;
  description: string;
  role: string;
  cluster: string;
  visualStatus: string;
  headings: Array<{ id: string; level: number; text: string }>;
  related: string[];
  linkedSlugs: string[];
  sourceNotes: string[];
  markdown: string;
  plainText: string;
  wordCount: number;
  readingMinutes: number;
  charts: PublicWikiChart[];
  heroImage: string;
  contentHash: string;
};

export type PublicWikiIndexPage = Omit<PublicWikiPage, "markdown" | "plainText">;

export type PublicWikiIndex = {
  generatedAt: string;
  sourceLabel: string;
  pages: PublicWikiIndexPage[];
  clusters: Array<{ id: string; label: string; count: number }>;
  roles: Array<{ id: string; label: string; count: number }>;
  graph: {
    nodes: Array<{
      id: string;
      title: string;
      cluster: string;
      role: string;
      href: string;
    }>;
    edges: Array<{ source: string; target: string }>;
  };
};
