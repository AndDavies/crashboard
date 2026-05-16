import type { BlogSourceLink } from "@/lib/blog/data";

type RichTextNode = Record<string, unknown>;

export type BlogPostStarter = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  metaDescription: string;
  focusTopic: string;
  tags: string[];
  answerSummary: string;
  relatedWikiSlugs: string[];
  sourceLinks: BlogSourceLink[];
  contentJson: Record<string, unknown>;
  contentHtml: string;
};

function text(value: string, marks?: RichTextNode[]): RichTextNode {
  return {
    type: "text",
    text: value,
    ...(marks ? { marks } : {}),
  };
}

function link(href: string): RichTextNode {
  return {
    type: "link",
    attrs: {
      href,
      target: null,
      rel: null,
      class: null,
    },
  };
}

function paragraph(content: RichTextNode[]): RichTextNode {
  return { type: "paragraph", content };
}

function heading(level: 2 | 3, value: string): RichTextNode {
  return {
    type: "heading",
    attrs: { level },
    content: [text(value)],
  };
}

function bulletList(items: string[]): RichTextNode {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph([text(item)])],
    })),
  };
}

function document(content: RichTextNode[]) {
  return { type: "doc", content };
}

export const blogStarterPosts: BlogPostStarter[] = [
  {
    id: "ai-automation-builders",
    title: "What AI Automation Builders Actually Do",
    slug: "what-ai-automation-builders-actually-do",
    excerpt:
      "A short answer on the practical role of AI automation builders: where they use code, where they use model judgment, and why evidence trails matter.",
    seoTitle: "What AI Automation Builders Actually Do",
    metaDescription:
      "AI automation builders design repeatable workflows that combine deterministic systems, model judgment, review points, and traceable evidence.",
    focusTopic: "AI automation builders",
    tags: ["AI workflows", "automation", "agentic engineering"],
    answerSummary:
      "AI automation builders turn messy repeatable work into reliable workflows by separating deterministic rules from model judgment, keeping evidence visible, and designing review points before autonomy expands.",
    relatedWikiSlugs: [
      "ai-automation-builders",
      "agent-execution-systems",
      "agent-evaluation-and-verification",
    ],
    sourceLinks: [],
    contentJson: document([
      heading(2, "Short answer"),
      paragraph([
        text(
          "An AI automation builder is not just someone who wires prompts together. The useful version designs a workflow where code, data, human review, and model judgment each have a clear job.",
        ),
      ]),
      heading(2, "The practical split"),
      bulletList([
        "Use deterministic code for rules, routing, storage, validation, and repeatable checks.",
        "Use model judgment for summarizing, ranking, drafting, comparison, and ambiguity.",
        "Use human review where the cost of being wrong is high or the source trail is weak.",
      ]),
      heading(2, "Why it matters"),
      paragraph([
        text("The supporting wiki page is "),
        text("AI Automation Builders", [link("/wiki/ai-automation-builders")]),
        text(
          ". The core lesson is that automation only becomes useful when the workflow is inspectable enough to trust and adjustable enough to improve.",
        ),
      ]),
    ]),
    contentHtml:
      '<h2>Short answer</h2><p>An AI automation builder is not just someone who wires prompts together. The useful version designs a workflow where code, data, human review, and model judgment each have a clear job.</p><h2>The practical split</h2><ul><li><p>Use deterministic code for rules, routing, storage, validation, and repeatable checks.</p></li><li><p>Use model judgment for summarizing, ranking, drafting, comparison, and ambiguity.</p></li><li><p>Use human review where the cost of being wrong is high or the source trail is weak.</p></li></ul><h2>Why it matters</h2><p>The supporting wiki page is <a href="/wiki/ai-automation-builders">AI Automation Builders</a>. The core lesson is that automation only becomes useful when the workflow is inspectable enough to trust and adjustable enough to improve.</p>',
  },
  {
    id: "personal-knowledge-systems",
    title: "A Personal Knowledge System for AI Work",
    slug: "personal-knowledge-system-for-ai-work",
    excerpt:
      "How a personal knowledge system can give AI tools durable context without turning private notes into vague public content.",
    seoTitle: "A Personal Knowledge System for AI Work",
    metaDescription:
      "A practical personal knowledge system for AI workflows: durable context, source-backed synthesis, reusable patterns, and clear public/private boundaries.",
    focusTopic: "Personal knowledge systems for AI",
    tags: ["knowledge systems", "AI workflows", "second brain"],
    answerSummary:
      "A personal knowledge system supports AI work when it preserves reusable context, connects claims to sources, and turns private raw material into public synthesis only after the evidence is strong enough to stand on its own.",
    relatedWikiSlugs: [
      "personal-knowledge-systems",
      "compiled-knowledge-systems",
      "second-brain-systems",
    ],
    sourceLinks: [],
    contentJson: document([
      heading(2, "Short answer"),
      paragraph([
        text(
          "The point of a personal knowledge system is not to collect everything. It is to make future work better by preserving the context, constraints, and evidence that would otherwise disappear.",
        ),
      ]),
      heading(2, "The useful pattern"),
      bulletList([
        "Keep raw evidence private until it is ready to be synthesized.",
        "Promote recurring ideas into stable concept pages.",
        "Link concepts to source notes so the reasoning can be inspected.",
        "Use blog posts only when a question deserves a longer answer.",
      ]),
      heading(2, "Where the wiki fits"),
      paragraph([
        text("The public starting point is "),
        text("Personal Knowledge Systems", [
          link("/wiki/personal-knowledge-systems"),
        ]),
        text(
          ". It connects the private notebook, source-backed wiki pages, and public essays into one reviewable system.",
        ),
      ]),
    ]),
    contentHtml:
      '<h2>Short answer</h2><p>The point of a personal knowledge system is not to collect everything. It is to make future work better by preserving the context, constraints, and evidence that would otherwise disappear.</p><h2>The useful pattern</h2><ul><li><p>Keep raw evidence private until it is ready to be synthesized.</p></li><li><p>Promote recurring ideas into stable concept pages.</p></li><li><p>Link concepts to source notes so the reasoning can be inspected.</p></li><li><p>Use blog posts only when a question deserves a longer answer.</p></li></ul><h2>Where the wiki fits</h2><p>The public starting point is <a href="/wiki/personal-knowledge-systems">Personal Knowledge Systems</a>. It connects the private notebook, source-backed wiki pages, and public essays into one reviewable system.</p>',
  },
  {
    id: "agent-memory",
    title: "What Agent Memory Should Preserve",
    slug: "what-agent-memory-should-preserve",
    excerpt:
      "A practical definition of useful agent memory: decisions, constraints, source trails, and context that improves future work.",
    seoTitle: "What Agent Memory Should Preserve",
    metaDescription:
      "Useful agent memory preserves decisions, constraints, source trails, and reusable context without treating old notes as unquestioned authority.",
    focusTopic: "Agent memory",
    tags: ["agent memory", "AI workflows", "context"],
    answerSummary:
      "Agent memory is useful when it preserves the parts of work that improve the next task: decisions made, constraints accepted, source trails checked, and caveats that should not be rediscovered from scratch.",
    relatedWikiSlugs: [
      "agent-memory-and-context-systems",
      "llm-memory",
      "context-compaction",
    ],
    sourceLinks: [],
    contentJson: document([
      heading(2, "Short answer"),
      paragraph([
        text(
          "Good agent memory is not a giant transcript. It is a compact operating record that helps the next run avoid repeating discovery, violating constraints, or losing the evidence behind a decision.",
        ),
      ]),
      heading(2, "What to preserve"),
      bulletList([
        "User preferences that have been confirmed by repeated work.",
        "Project constraints that should survive across sessions.",
        "Decisions and their reasons, especially when they shape future implementation.",
        "Evidence trails that make claims auditable.",
      ]),
      heading(2, "The boundary"),
      paragraph([
        text("The related wiki page is "),
        text("Agent Memory & Context Systems", [
          link("/wiki/agent-memory-and-context-systems"),
        ]),
        text(
          ". The warning is simple: memory should assist judgment, not replace fresh verification when the fact may have changed.",
        ),
      ]),
    ]),
    contentHtml:
      '<h2>Short answer</h2><p>Good agent memory is not a giant transcript. It is a compact operating record that helps the next run avoid repeating discovery, violating constraints, or losing the evidence behind a decision.</p><h2>What to preserve</h2><ul><li><p>User preferences that have been confirmed by repeated work.</p></li><li><p>Project constraints that should survive across sessions.</p></li><li><p>Decisions and their reasons, especially when they shape future implementation.</p></li><li><p>Evidence trails that make claims auditable.</p></li></ul><h2>The boundary</h2><p>The related wiki page is <a href="/wiki/agent-memory-and-context-systems">Agent Memory &amp; Context Systems</a>. The warning is simple: memory should assist judgment, not replace fresh verification when the fact may have changed.</p>',
  },
];

export function getBlogStarterPost(id: string | undefined) {
  if (!id) return undefined;
  return blogStarterPosts.find((post) => post.id === id);
}
