import type { PublicWikiIndexPage, PublicWikiPage } from "@/lib/public-wiki/types";

export type WikiAeoTarget = {
  question: string;
  answer: string;
  primarySlug: string;
  supportingSlugs: string[];
  topic: string;
};

export const wikiAeoTargets: WikiAeoTarget[] = [
  {
    question: "What is an AI automation builder?",
    answer:
      "An AI automation builder combines deterministic workflow design with model-assisted judgment so repeatable work can be delegated without losing control of the evidence, review points, or operating context.",
    primarySlug: "ai-automation-builders",
    supportingSlugs: [
      "agent-execution-systems",
      "coding-agent-workflows",
      "agent-evaluation-and-verification",
    ],
    topic: "AI workflow systems",
  },
  {
    question: "How should personal knowledge systems support AI workflows?",
    answer:
      "A useful personal knowledge system gives AI tools durable context, source-backed summaries, reusable patterns, and clear boundaries between private evidence and public synthesis.",
    primarySlug: "personal-knowledge-systems",
    supportingSlugs: [
      "compiled-knowledge-systems",
      "second-brain-systems",
      "agent-memory-and-context-systems",
    ],
    topic: "Knowledge systems",
  },
  {
    question: "What makes agent memory useful?",
    answer:
      "Agent memory is useful when it preserves decisions, constraints, source trails, and reusable context in a form that improves future work without inventing authority or hiding uncertainty.",
    primarySlug: "agent-memory-and-context-systems",
    supportingSlugs: [
      "llm-memory",
      "context-compaction",
      "persistent-agent-threads",
    ],
    topic: "Agent memory",
  },
  {
    question: "How should AI workflows separate rules from judgment?",
    answer:
      "Reliable AI workflows keep deterministic rules in code, checklists, and structured data, while reserving model judgment for synthesis, prioritization, drafting, and ambiguity that can be reviewed.",
    primarySlug: "agent-execution-systems",
    supportingSlugs: [
      "agentic-engineering",
      "agent-evaluation-and-verification",
      "trust-boundaries-and-assurance",
    ],
    topic: "AI execution",
  },
  {
    question: "What is source-backed research in an AI workflow?",
    answer:
      "Source-backed research connects claims to recoverable evidence, distinguishes raw material from synthesis, and makes the route from question to answer inspectable by a human reader.",
    primarySlug: "compiled-knowledge-systems",
    supportingSlugs: [
      "ai-assisted-content-systems",
      "communication-and-idea-transfer",
      "personal-knowledge-systems",
    ],
    topic: "Source-backed research",
  },
];

export function getWikiAeoTargetPages(
  target: WikiAeoTarget,
  pages: PublicWikiIndexPage[],
) {
  const slugs = new Set([target.primarySlug, ...target.supportingSlugs]);
  return pages.filter((page) => slugs.has(page.slug));
}

export function getWikiAeoTargetsForPage(page: PublicWikiPage | PublicWikiIndexPage) {
  return wikiAeoTargets.filter(
    (target) =>
      target.primarySlug === page.slug ||
      target.supportingSlugs.includes(page.slug) ||
      target.topic.toLowerCase().includes(page.cluster.toLowerCase()),
  );
}

export function getPageAnswerQuestion(page: PublicWikiPage | PublicWikiIndexPage) {
  const directTarget = wikiAeoTargets.find((target) => target.primarySlug === page.slug);
  if (directTarget) return directTarget.question;

  const topic = page.title.replace(/\s+/g, " ").trim();
  return `What should readers understand about ${topic}?`;
}

export type WikiFaqEntry = { question: string; answer: string };

function compactAnswer(input: string, maxLength = 320) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const slice = normalized.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 120 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

/**
 * Build genuine question/answer pairs for a wiki page so answer engines
 * (Google AI Overviews, Perplexity, etc.) can extract a direct response.
 */
export function buildWikiPageFaq(
  page: PublicWikiPage | PublicWikiIndexPage,
  extraTakeaways: string[] = [],
): WikiFaqEntry[] {
  const entries: WikiFaqEntry[] = [];
  const seenQuestions = new Set<string>();

  const push = (question: string, answer: string) => {
    const key = question.trim().toLowerCase();
    if (!question || !answer || seenQuestions.has(key)) return;
    seenQuestions.add(key);
    entries.push({ question: question.trim(), answer: compactAnswer(answer) });
  };

  push(getPageAnswerQuestion(page), page.description);

  for (const target of getWikiAeoTargetsForPage(page)) {
    push(target.question, target.answer);
  }

  for (const takeaway of extraTakeaways) {
    if (entries.length >= 5) break;
    push(`What is a key takeaway about ${page.title}?`, takeaway);
  }

  return entries.slice(0, 6);
}
