import type {
  IntelligenceConceptType,
  IntelligenceDocumentSegmentInput,
  IntelligenceExtractedConcept,
} from "@/lib/intelligence/types";

export const INTELLIGENCE_TAXONOMY_VERSION = "signal-taxonomy-v1";
export const INTELLIGENCE_CONCEPT_EXTRACTION_VERSION = "concepts-v1";

export type CuratedConceptDefinition = {
  conceptType: IntelligenceConceptType;
  canonicalLabel: string;
  domain: string;
  subdomain: string;
  aliases: string[];
  description: string;
};

export type CuratedConceptMention = {
  definition: CuratedConceptDefinition;
  segmentIndex: number | null;
  scope: "title" | "body" | "segment_title" | "segment_body";
  mentionCount: number;
  surfaceForms: string[];
  evidenceText: string;
};

export const CURATED_CONCEPTS: CuratedConceptDefinition[] = [
  { conceptType: "theme", canonicalLabel: "artificial intelligence", domain: "AI", subdomain: "general", aliases: ["AI", "artificial intelligence"], description: "Artificial-intelligence systems, markets, and policy." },
  { conceptType: "theme", canonicalLabel: "agentic AI", domain: "AI", subdomain: "agents", aliases: ["agentic AI", "AI agents", "autonomous agents"], description: "AI systems that plan or act through tools." },
  { conceptType: "capability", canonicalLabel: "foundation models", domain: "AI", subdomain: "models", aliases: ["foundation model", "foundation models", "large language model", "large language models", "LLM", "LLMs"], description: "General-purpose foundation and language models." },
  { conceptType: "capability", canonicalLabel: "AI infrastructure", domain: "AI", subdomain: "infrastructure", aliases: ["AI infrastructure", "AI compute", "GPU cluster", "GPU clusters", "model infrastructure"], description: "Compute, cloud, data-centre, and platform infrastructure for AI." },
  { conceptType: "theme", canonicalLabel: "AI security", domain: "AI", subdomain: "security", aliases: ["AI security", "model security", "LLM security", "AI safety and security"], description: "Security risks and controls for AI systems." },
  { conceptType: "theme", canonicalLabel: "AI governance", domain: "AI", subdomain: "governance", aliases: ["AI governance", "AI regulation", "model governance", "responsible AI"], description: "Governance, policy, and regulation of AI." },
  { conceptType: "theme", canonicalLabel: "developer tools", domain: "AI", subdomain: "software", aliases: ["developer tools", "developer tooling", "coding assistant", "coding assistants"], description: "Tools supporting software development and engineering." },
  { conceptType: "capability", canonicalLabel: "robotics", domain: "AI", subdomain: "physical systems", aliases: ["robotics", "robotic system", "robotic systems", "humanoid robot", "humanoid robots"], description: "Robotic and embodied autonomous systems." },
  { conceptType: "theme", canonicalLabel: "cybersecurity", domain: "Cybersecurity", subdomain: "general", aliases: ["cybersecurity", "cyber security", "information security", "infosec"], description: "Cybersecurity threats, products, operations, and policy." },
  { conceptType: "theme", canonicalLabel: "ransomware", domain: "Cybersecurity", subdomain: "threats", aliases: ["ransomware", "ransom attack", "ransom attacks"], description: "Ransomware activity and defensive response." },
  { conceptType: "theme", canonicalLabel: "cloud security", domain: "Cybersecurity", subdomain: "cloud", aliases: ["cloud security", "cloud workload security", "cloud-native security"], description: "Security of cloud infrastructure and workloads." },
  { conceptType: "capability", canonicalLabel: "identity and access management", domain: "Cybersecurity", subdomain: "identity", aliases: ["identity and access management", "identity access management", "IAM", "privileged access management", "PAM"], description: "Identity, authentication, authorization, and privileged access." },
  { conceptType: "theme", canonicalLabel: "software supply chain security", domain: "Cybersecurity", subdomain: "application security", aliases: ["software supply chain security", "supply chain security", "software supply chain"], description: "Security of software dependencies, builds, and delivery chains." },
  { conceptType: "theme", canonicalLabel: "vulnerability exploitation", domain: "Cybersecurity", subdomain: "threats", aliases: ["vulnerability exploitation", "exploited vulnerability", "zero-day exploitation", "zero day exploitation"], description: "Exploitation of vulnerabilities and zero-day flaws." },
  { conceptType: "capability", canonicalLabel: "incident response", domain: "Cybersecurity", subdomain: "operations", aliases: ["incident response", "breach response", "cyber incident response"], description: "Detection, containment, investigation, and recovery." },
  { conceptType: "capability", canonicalLabel: "threat intelligence", domain: "Cybersecurity", subdomain: "operations", aliases: ["threat intelligence", "cyber threat intelligence", "CTI"], description: "Collection and analysis of adversary and threat information." },
  { conceptType: "theme", canonicalLabel: "critical infrastructure security", domain: "Cybersecurity", subdomain: "critical infrastructure", aliases: ["critical infrastructure security", "critical infrastructure cybersecurity", "operational technology security", "OT security"], description: "Security of critical infrastructure and operational technology." },
  { conceptType: "capability", canonicalLabel: "post-quantum cryptography", domain: "Cybersecurity", subdomain: "cryptography", aliases: ["post-quantum cryptography", "post quantum cryptography", "PQC", "quantum-safe cryptography"], description: "Cryptography designed to resist quantum attacks." },
  { conceptType: "theme", canonicalLabel: "defence procurement", domain: "Defence", subdomain: "procurement", aliases: ["defence procurement", "defense procurement", "military procurement", "defence acquisition", "defense acquisition"], description: "Military acquisition, contracting, and procurement activity." },
  { conceptType: "theme", canonicalLabel: "submarine procurement", domain: "Defence", subdomain: "maritime", aliases: ["submarine procurement", "submarine acquisition", "submarine fleet", "submarine replacement"], description: "Acquisition and recapitalization of submarine fleets." },
  { conceptType: "capability", canonicalLabel: "uncrewed systems", domain: "Defence", subdomain: "autonomy", aliases: ["uncrewed systems", "unmanned systems", "UAS", "UAV", "drone", "drones", "remotely piloted aircraft"], description: "Air, land, maritime, and undersea uncrewed systems." },
  { conceptType: "capability", canonicalLabel: "counter-UAS", domain: "Defence", subdomain: "air defence", aliases: ["counter-UAS", "counter UAS", "C-UAS", "counter-drone", "counter drone"], description: "Detection and defeat of hostile uncrewed aircraft." },
  { conceptType: "capability", canonicalLabel: "air and missile defence", domain: "Defence", subdomain: "air defence", aliases: ["air and missile defence", "air and missile defense", "integrated air defence", "integrated air defense", "missile defence", "missile defense"], description: "Integrated air and missile warning and defence." },
  { conceptType: "theme", canonicalLabel: "naval modernization", domain: "Defence", subdomain: "maritime", aliases: ["naval modernization", "naval modernisation", "fleet modernization", "fleet modernisation", "shipbuilding program", "shipbuilding programme"], description: "Modernization of naval fleets and shipbuilding capacity." },
  { conceptType: "theme", canonicalLabel: "fighter aircraft programs", domain: "Defence", subdomain: "air", aliases: ["fighter aircraft program", "fighter aircraft programs", "fighter aircraft programme", "fighter aircraft programmes", "fighter procurement"], description: "Fighter-aircraft acquisition and modernization programs." },
  { conceptType: "capability", canonicalLabel: "satellite communications", domain: "Defence", subdomain: "space", aliases: ["satellite communications", "satcom", "military satellite communications", "space communications"], description: "Satellite-enabled communications and resilient connectivity." },
  { conceptType: "capability", canonicalLabel: "electronic warfare", domain: "Defence", subdomain: "electromagnetic spectrum", aliases: ["electronic warfare", "EW", "electromagnetic warfare", "spectrum warfare"], description: "Electronic attack, support, protection, and spectrum operations." },
  { conceptType: "theme", canonicalLabel: "allied interoperability", domain: "Defence", subdomain: "alliances", aliases: ["allied interoperability", "NATO interoperability", "coalition interoperability"], description: "Interoperability among allied forces and systems." },
  { conceptType: "theme", canonicalLabel: "defence industrial base", domain: "Defence", subdomain: "industry", aliases: ["defence industrial base", "defense industrial base", "defence industry", "defense industry", "military industrial base"], description: "Defence production capacity, suppliers, and industrial policy." },
  { conceptType: "capability", canonicalLabel: "precision strike", domain: "Defence", subdomain: "fires", aliases: ["precision strike", "deep precision strike", "long-range strike", "long range strike"], description: "Long-range and precision-strike weapons and programs." },
  { conceptType: "theme", canonicalLabel: "funding and investment", domain: "Business", subdomain: "capital", aliases: ["funding", "investment", "funding and investment", "capital raise", "financing round"], description: "Capital formation, grants, and investment announcements." },
  { conceptType: "theme", canonicalLabel: "venture capital", domain: "Business", subdomain: "capital", aliases: ["venture capital", "VC funding", "venture funding"], description: "Venture investment and fundraising." },
  { conceptType: "theme", canonicalLabel: "private equity", domain: "Business", subdomain: "capital", aliases: ["private equity", "PE investment", "buyout fund", "buyout funds"], description: "Private-equity investment and ownership activity." },
  { conceptType: "theme", canonicalLabel: "mergers and acquisitions", domain: "Business", subdomain: "transactions", aliases: ["mergers and acquisitions", "M&A", "merger", "acquisition", "takeover"], description: "Corporate mergers, acquisitions, and takeovers." },
  { conceptType: "theme", canonicalLabel: "partnerships", domain: "Business", subdomain: "alliances", aliases: ["partnership", "partnerships", "strategic alliance", "joint venture", "memorandum of understanding", "MOU"], description: "Commercial and strategic partnerships." },
  { conceptType: "theme", canonicalLabel: "capacity expansion", domain: "Business", subdomain: "operations", aliases: ["capacity expansion", "production expansion", "new factory", "new plant", "production line"], description: "Expansion of facilities and productive capacity." },
  { conceptType: "theme", canonicalLabel: "export controls", domain: "Business", subdomain: "policy", aliases: ["export control", "export controls", "technology restrictions", "trade restrictions"], description: "Controls and restrictions on technology and goods exports." },
  { conceptType: "theme", canonicalLabel: "strength and conditioning", domain: "Health", subdomain: "fitness", aliases: ["strength and conditioning", "strength training", "resistance training"], description: "Strength, conditioning, and physical performance." },
  { conceptType: "theme", canonicalLabel: "recovery", domain: "Health", subdomain: "performance", aliases: ["recovery", "sleep and recovery", "training recovery"], description: "Recovery, sleep, fatigue, and readiness." },
  { conceptType: "theme", canonicalLabel: "nutrition", domain: "Health", subdomain: "nutrition", aliases: ["nutrition", "sports nutrition", "dietary strategy"], description: "Nutrition, diet, and performance fueling." },
  { conceptType: "theme", canonicalLabel: "longevity", domain: "Health", subdomain: "healthspan", aliases: ["longevity", "healthspan", "healthy aging", "healthy ageing"], description: "Longevity, healthspan, and ageing." },
];

export function normalizeConceptKey(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/gu, " and ")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

const aliasIndex = new Map<string, CuratedConceptDefinition>();
for (const definition of CURATED_CONCEPTS) {
  for (const alias of [definition.canonicalLabel, ...definition.aliases]) {
    aliasIndex.set(normalizeConceptKey(alias), definition);
  }
}

export function resolveCuratedConcept(value: string) {
  return aliasIndex.get(normalizeConceptKey(value)) ?? null;
}

function aliasPattern(alias: string) {
  const tokens = alias.trim().split(/[\s_/-]+/u).filter(Boolean);
  const body = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("(?:[\\s_/-]+)");
  return new RegExp(`(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`, "giu");
}

function matchDefinition(text: string, definition: CuratedConceptDefinition) {
  const ranges: Array<{ start: number; end: number; value: string }> = [];
  for (const alias of [definition.canonicalLabel, ...definition.aliases]) {
    for (const match of text.matchAll(aliasPattern(alias))) {
      if (match.index === undefined) continue;
      ranges.push({ start: match.index, end: match.index + match[0].length, value: match[0] });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const accepted: typeof ranges = [];
  for (const range of ranges) {
    if (accepted.some((candidate) => range.start < candidate.end && range.end > candidate.start)) {
      continue;
    }
    accepted.push(range);
  }
  return {
    mentionCount: accepted.length,
    surfaceForms: [...new Set(accepted.map((match) => match.value))],
    evidenceText: accepted.length
      ? text.slice(Math.max(0, accepted[0]!.start - 100), accepted[0]!.end + 180).trim()
      : "",
  };
}

export function extractCuratedConceptMentions(input: {
  title?: string | null;
  contentText: string;
  segments: IntelligenceDocumentSegmentInput[];
}) {
  const mentions: CuratedConceptMention[] = [];
  const scopes: Array<{
    segmentIndex: number | null;
    scope: CuratedConceptMention["scope"];
    text: string;
  }> = [
    { segmentIndex: null, scope: "title", text: input.title ?? "" },
    ...(input.segments.length
      ? input.segments.flatMap((segment) => [
          { segmentIndex: segment.segmentIndex, scope: "segment_title" as const, text: segment.title ?? "" },
          { segmentIndex: segment.segmentIndex, scope: "segment_body" as const, text: segment.contentText },
        ])
      : [{ segmentIndex: null, scope: "body" as const, text: input.contentText }]),
  ];

  for (const definition of CURATED_CONCEPTS) {
    for (const scope of scopes) {
      if (!scope.text.trim()) continue;
      const match = matchDefinition(scope.text, definition);
      if (!match.mentionCount) continue;
      mentions.push({ definition, segmentIndex: scope.segmentIndex, scope: scope.scope, ...match });
    }
  }
  return mentions;
}

export function canonicalizeExtractedConcept(
  concept: IntelligenceExtractedConcept,
): IntelligenceExtractedConcept {
  const curated = resolveCuratedConcept(concept.canonicalLabel);
  if (!curated) {
    return {
      ...concept,
      canonicalLabel: concept.canonicalLabel.trim(),
      aliases: [...new Set(concept.aliases.map((alias) => alias.trim()).filter(Boolean))],
      domain: concept.domain.trim(),
      subdomain: concept.subdomain.trim(),
    };
  }
  return {
    ...concept,
    conceptType: curated.conceptType,
    canonicalLabel: curated.canonicalLabel,
    domain: curated.domain,
    subdomain: curated.subdomain,
    aliases: [...new Set([...curated.aliases, ...concept.aliases])],
  };
}

export const __testables = {
  aliasPattern,
  matchDefinition,
};
