import type { BlogPostSummary } from "@/lib/blog/data";

export type BlogTopic = {
  slug: string;
  title: string;
  question: string;
  description: string;
  answer: string;
  signals: string[];
  keywords: string[];
  wikiSlugs: string[];
  heroImage: string;
};

export const blogTopics: BlogTopic[] = [
  {
    slug: "ai-operating-models",
    title: "AI Operating Models",
    question: "How are organizations turning AI capability into repeatable work?",
    description:
      "Briefs and knowledge notes on deployment, workflow redesign, agentic engineering, governance, and the organizational systems needed to move beyond isolated AI pilots.",
    answer:
      "The durable advantage is moving away from model access and toward operating design: clear ownership, trustworthy context, measurable workflows, and teams that can absorb implementation risk.",
    signals: [
      "Deployment capacity is becoming a product and management discipline of its own.",
      "Context, evaluation, and handoff quality increasingly determine whether agents create value.",
      "Organizations need decision rights and operating metrics before automation can scale safely.",
    ],
    keywords: [
      "artificial intelligence",
      "enterprise ai",
      "agentic",
      "agents",
      "workflow",
      "deployment",
      "operating model",
    ],
    wikiSlugs: [
      "ai-native-organizations",
      "agentic-engineering",
      "ai-agents-and-software-systems",
    ],
    heroImage: "/wiki/generated-images/ai-native-organizations.svg",
  },
  {
    slug: "canadian-defence-modernization",
    title: "Canadian Defence Modernization",
    question: "What capabilities and industrial choices will shape Canadian defence readiness?",
    description:
      "A source-backed trail across procurement, sovereign manufacturing, allied interoperability, space systems, cyber operations, and the infrastructure behind national readiness.",
    answer:
      "Modernization depends on more than acquisition announcements. Exposure grows when capital, procurement speed, industrial capacity, secure data, and allied operating requirements fail to move together.",
    signals: [
      "Sovereign capacity matters most where supply chains and operational control intersect.",
      "Procurement design determines whether policy ambition becomes deployable capability.",
      "Space, cyber, compute, and physical infrastructure now form one readiness system.",
    ],
    keywords: [
      "defence",
      "defense",
      "military",
      "nato",
      "national security",
      "procurement",
      "sovereign",
      "canada",
    ],
    wikiSlugs: [
      "sovereign-defence-manufacturing",
      "space-enabled-military-infrastructure",
      "military-cyber-operations",
    ],
    heroImage: "/wiki/generated-images/sovereign-defence-manufacturing.svg",
  },
  {
    slug: "agent-security-and-control",
    title: "Agent Security and Control",
    question: "How can autonomous systems remain useful, observable, and bounded?",
    description:
      "Research on trust boundaries, agent permissions, evaluation, privacy, cybersecurity, and the controls required when software can take consequential actions.",
    answer:
      "Useful autonomy requires explicit boundaries: least-privilege tools, inspectable state, independent evaluation, reversible actions, and escalation paths that survive real operating pressure.",
    signals: [
      "Agent risk is increasingly an execution-system problem, not only a model-safety problem.",
      "Memory and tool permissions create durable trust boundaries that need separate review.",
      "Evaluation must test consequential workflows and recovery behavior, not just answer quality.",
    ],
    keywords: [
      "agent security",
      "cybersecurity",
      "cyber",
      "safety",
      "governance",
      "privacy",
      "trust boundary",
    ],
    wikiSlugs: [
      "ai-safety-and-control",
      "trust-boundaries-and-assurance",
      "cybersecurity-boundaries",
    ],
    heroImage: "/wiki/generated-images/ai-safety-and-control.svg",
  },
  {
    slug: "compute-power-and-infrastructure",
    title: "Compute, Power, and Infrastructure",
    question: "Where do physical constraints change the economics of digital capability?",
    description:
      "Signals connecting sovereign compute, data centres, electricity, critical infrastructure, semiconductor capacity, and the physical systems behind AI and national resilience.",
    answer:
      "Compute strategy is becoming infrastructure strategy. Exposure follows the dependencies between power, chips, networks, sites, capital, and the jurisdictions that can keep those systems operating.",
    signals: [
      "Power availability and interconnection timelines increasingly shape compute investment.",
      "Sovereignty claims are only credible when ownership and operational control are explicit.",
      "Infrastructure concentration creates both economic leverage and systemic fragility.",
    ],
    keywords: [
      "compute",
      "data centre",
      "data center",
      "energy",
      "power",
      "semiconductor",
      "infrastructure",
      "critical infrastructure",
      "sovereign ai",
    ],
    wikiSlugs: [
      "sovereign-ai-compute",
      "sovereignty-and-critical-infrastructure",
      "geopolitical-business-risk",
    ],
    heroImage: "/wiki/generated-images/sovereign-ai-compute.svg",
  },
  {
    slug: "financial-infrastructure-and-markets",
    title: "Financial Infrastructure and Markets",
    question: "How are capital, payment rails, and market structure being redesigned?",
    description:
      "Briefs on financial rails, digital assets, capital allocation, market structure, venture signals, and the institutions that determine how money moves and risk is priced.",
    answer:
      "Financial innovation compounds when new rails gain institutional distribution, regulatory clarity, and credible operating controls. The useful signal is adoption architecture, not novelty alone.",
    signals: [
      "Distribution and compliance often matter more than technical differentiation.",
      "Market structure changes when settlement, custody, and access move together.",
      "Capital flows reveal which infrastructure shifts are becoming durable operating systems.",
    ],
    keywords: [
      "finance",
      "financial",
      "fintech",
      "payments",
      "capital",
      "markets",
      "banking",
      "crypto",
      "digital asset",
    ],
    wikiSlugs: [
      "money-wealth-and-markets",
      "wealth-and-market-cycles",
      "venture-opportunity-discovery",
    ],
    heroImage: "/wiki/generated-images/money-wealth-and-markets.svg",
  },
];

export function getBlogTopic(slug: string) {
  return blogTopics.find((topic) => topic.slug === slug) ?? null;
}

export function matchesBlogTopic(post: BlogPostSummary, topic: BlogTopic) {
  const haystack = [
    post.title,
    post.excerpt,
    post.answerSummary,
    post.focusTopic,
  ]
    .join(" ")
    .toLowerCase();

  return topic.keywords.some((keyword) => haystack.includes(keyword));
}

export function getBlogTopicsForPost(post: BlogPostSummary) {
  return blogTopics.filter((topic) => matchesBlogTopic(post, topic));
}
