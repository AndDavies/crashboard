import type {
  IntelligenceSignalKind,
  IntelligenceSignalLens,
} from "@/lib/intelligence/signals-v2-types";

export type SignalDefinition = {
  key: string;
  kind: IntelligenceSignalKind;
  label: string;
  aliases: string[];
  lensKeys: IntelligenceSignalLens[];
};

export type SignalObservation = SignalDefinition & {
  extraction: "taxonomy" | "identifier" | "phrase";
  mentions: number;
  titleMentions: number;
};

const MONTHS = `january february march april may june july august september october november december
jan feb mar apr jun jul aug sep sept oct nov dec`.split(/\s+/u);
const WEEKDAYS = `monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun`.split(/\s+/u);

export const BLOCKED_SIGNAL_LABELS = new Set([
  ...MONTHS,
  ...WEEKDAYS,
  ...`about above across after again against ahead almost already also another approach around article available away back base become becomes becoming been before being below best better big browser build building built called can cannot change changes click come comes coming content continue could curate curator daily day decision decisions did does doing done due early edition email end enough even every export far few first follow following forward free from full further get gets getting give given gives go goes going good great half help here highly hour hours hrs how however investment issue itself judgment just keep know knowledge known last latest learn less like likely link links little long look looking made make makes making many market markets matter meaningful might month more most much must name near need needs newsletter next now often once one only open other others our over own page part past people per please portfolio possible post posts process progress read ready recent recommended remove report reports right same say says see seen send set share shared short should show shows simple since some source stay step still story strengthen such summit take target task techcrunch than their them then there these thing things think this those three through time today together tomorrow tool tools top toward training turn two under until update updates use used uses using very view want way web week well were what when where whether which while who why will with within without work working would year years yet you your`.split(/\s+/u),
  "from the web",
  "highly recommended",
  "latest issue",
  "more news to know",
  "new on",
  "read more",
  "subscribe",
  "top news",
  "view in browser",
]);

const PHRASE_EDGE_STOPWORDS = new Set([
  ...BLOCKED_SIGNAL_LABELS,
  ...`a an and are as at be but by for has have he her his i if in into is it its no not of on or our she so that the theirs they to up us was we what where which who whose with you`.split(/\s+/u),
]);

const IDENTIFIER_EXCLUSIONS = new Set([
  ...BLOCKED_SIGNAL_LABELS,
  ...`AI API CEO CFO CIO CTO COO DUE FAQ GDP HTML HTTP HTTPS IT JSON KPI LLC LTD PDF Q1 Q2 Q3 Q4 QR RSS SaaS SEO UK USA US USD VC PE TV XML`.toLocaleLowerCase().split(/\s+/u),
]);

const PHRASE_ANCHORS = new Set(`
  acquisition acquisitions agent agents ai air aircraft alliance ammunition arctic artificial attack attacks autonomy autonomous award awards
  breach breaches capability capital chip chips cloud command compliance compute contract contracts credit cyber cybersecurity data defence defense deployment deployments deterrence digital drone drones energy equity export exports finance financing fleet funding fund funds geopolitical hypersonic identity industry infrastructure innovation investment investments investor investors intelligence launch launches machine market markets missile missiles model models munition munitions naval navy nuclear offensive partnership partnerships payment payments procurement programme program programmes programs quantum radar ransomware regulation regulations resilience robotics satellite satellites security semiconductor semiconductors shipbuilding software space stablecoin strike strikes submarine submarines supply surveillance system systems technology testing tests threat threats trial trials uas uncrewed venture vulnerability vulnerabilities weapon weapons workforce zero
`.trim().split(/\s+/u));

const PHRASE_REJECTIONS = [
  /^(?:age of ai|ai (?:era|native|powered|skill)|new .+)$/u,
  /^(?:air force|cyber news)$/u,
  /\b(?:picks|says|said|shows|wants)\b/u,
];

const ACRONYM_DISPLAY = new Set(`AI AUKUS BAE CAF C2 C4ISR CISA CMMC C-UAS DARPA DND DOD EW F-35 GPT HIMARS IAM ISR JADC2 LLM MFA NATO NCIA NIST NORAD NSA NSPA PSPC RCAF RCN RTX UAS USAF USMC USN VC`.split(/\s+/u));

const DEFINITIONS: SignalDefinition[] = [
  // Topics: deliberately stable analytical concepts, not transient article wording.
  { key: "ai-agents", kind: "topic", label: "AI agents", aliases: ["ai agent", "ai agents", "agentic ai", "agentic system", "autonomous agent"], lensKeys: ["all", "ai"] },
  { key: "ai-coding", kind: "topic", label: "AI coding tools", aliases: ["ai coding", "coding agent", "code agent", "developer agent", "vibe coding", "claude code", "github copilot"], lensKeys: ["all", "ai"] },
  { key: "ai-infrastructure", kind: "topic", label: "AI compute and infrastructure", aliases: ["ai infrastructure", "ai compute", "cloud ai", "compute capacity", "gpu capacity", "gpu cluster", "ai data center", "ai data centre"], lensKeys: ["all", "ai"] },
  { key: "foundation-models", kind: "topic", label: "Foundation models", aliases: ["foundation model", "large language model", "llm", "multimodal model", "frontier model"], lensKeys: ["all", "ai"] },
  { key: "enterprise-ai", kind: "topic", label: "Enterprise AI adoption", aliases: ["enterprise ai", "ai adoption", "ai transformation", "ai deployment", "deploying ai"], lensKeys: ["all", "ai"] },
  { key: "ai-governance", kind: "topic", label: "AI governance and safety", aliases: ["ai governance", "ai safety", "responsible ai", "ai regulation", "model safety", "ai risk"], lensKeys: ["all", "ai"] },
  { key: "ai-cyber-threats", kind: "topic", label: "AI-enabled cyber threats", aliases: ["ai security", "ai cyberattack", "ai cyber attack", "ai-powered cyberattack", "agentic ransomware", "agent ransomware", "ai agent ransomware"], lensKeys: ["all", "ai", "cyber"] },
  { key: "physical-ai", kind: "topic", label: "Robotics and physical AI", aliases: ["physical ai", "robotics", "humanoid robot", "industrial robot", "robotic system"], lensKeys: ["all", "ai"] },
  { key: "identity-security", kind: "topic", label: "Identity and access security", aliases: ["identity security", "identity and access", "access management", "zero trust", "multi-factor authentication", "multifactor authentication", "credential theft"], lensKeys: ["all", "cyber"] },
  { key: "ransomware", kind: "topic", label: "Ransomware and extortion", aliases: ["ransomware", "cyber extortion", "data extortion", "ransom demand"], lensKeys: ["all", "cyber"] },
  { key: "software-supply-chain", kind: "topic", label: "Software supply-chain security", aliases: ["software supply chain", "dependency attack", "package compromise", "npm attack", "malicious package", "repository compromise"], lensKeys: ["all", "cyber"] },
  { key: "cloud-security", kind: "topic", label: "Cloud security", aliases: ["cloud security", "cloud breach", "cloud vulnerability", "cloud misconfiguration"], lensKeys: ["all", "cyber"] },
  { key: "vulnerability-exploitation", kind: "topic", label: "Active vulnerability exploitation", aliases: ["actively exploited", "vulnerability exploitation", "zero-day", "zero day", "remote code execution", "exploit chain"], lensKeys: ["all", "cyber"] },
  { key: "data-breaches", kind: "topic", label: "Data breaches", aliases: ["data breach", "data leak", "records exposed", "customer data stolen"], lensKeys: ["all", "cyber"] },
  { key: "cyber-compliance", kind: "topic", label: "Cybersecurity regulation and compliance", aliases: ["cybersecurity regulation", "cyber compliance", "security compliance", "cmmc", "nist framework"], lensKeys: ["all", "cyber", "defence"] },
  { key: "critical-infrastructure-cyber", kind: "topic", label: "Critical-infrastructure cybersecurity", aliases: ["critical infrastructure cyber", "operational technology security", "industrial control system security", "ics security", "ot security"], lensKeys: ["all", "cyber", "defence"] },
  { key: "counter-drone", kind: "topic", label: "Counter-drone defence", aliases: ["counter-uas", "counter uas", "c-uas", "counter drone", "counter-drone", "anti-drone"], lensKeys: ["all", "defence"] },
  { key: "uncrewed-systems", kind: "topic", label: "Uncrewed and autonomous systems", aliases: ["uncrewed system", "unmanned system", "autonomous system", "maritime drone", "uncrewed aircraft", "unmanned aerial", "drone warfare"], lensKeys: ["all", "defence", "ai"] },
  { key: "autonomous-ground", kind: "topic", label: "Autonomous ground vehicles", aliases: ["autonomous ground", "autonomous ground vehicle", "uncrewed ground vehicle", "unmanned ground vehicle", "robotic combat vehicle"], lensKeys: ["all", "defence", "ai"] },
  { key: "air-missile-defence", kind: "topic", label: "Air and missile defence", aliases: ["air and missile defence", "air and missile defense", "integrated air defence", "integrated air defense", "missile defence", "missile defense", "air defence", "air defense", "air defence system"], lensKeys: ["all", "defence"] },
  { key: "long-range-strike", kind: "topic", label: "Long-range strike", aliases: ["long-range strike", "long range strike", "deep strike", "precision strike", "hypersonic weapon", "hypersonic missile"], lensKeys: ["all", "defence"] },
  { key: "defence-procurement", kind: "topic", label: "Defence procurement", aliases: ["defence procurement", "defense procurement", "military procurement", "defence acquisition", "defense acquisition", "weapons purchase", "aircraft purchase"], lensKeys: ["all", "defence"] },
  { key: "defence-production", kind: "topic", label: "Defence industrial production", aliases: ["defence industrial base", "defense industrial base", "defence production", "defense production", "military production", "production capacity", "weapons production"], lensKeys: ["all", "defence"] },
  { key: "military-space", kind: "topic", label: "Military space capabilities", aliases: ["military space", "space command", "space force", "satellite defence", "satellite defense", "space domain awareness"], lensKeys: ["all", "defence"] },
  { key: "electronic-warfare", kind: "topic", label: "Electronic warfare", aliases: ["electronic warfare", "electromagnetic warfare", "electronic attack", "signal jamming", "gps jamming"], lensKeys: ["all", "defence", "cyber"] },
  { key: "command-control-isr", kind: "topic", label: "Command, control and ISR", aliases: ["command and control", "command control", "c2 system", "c4isr", "intelligence surveillance and reconnaissance", "isr capability", "battle management"], lensKeys: ["all", "defence"] },
  { key: "naval-modernization", kind: "topic", label: "Naval modernization and shipbuilding", aliases: ["naval modernization", "naval modernisation", "military shipbuilding", "naval shipbuilding", "warship programme", "warship program", "fleet modernization"], lensKeys: ["all", "defence"] },
  { key: "submarines", kind: "topic", label: "Submarines and undersea systems", aliases: ["submarine", "submarines", "undersea warfare", "underwater system", "subsea system"], lensKeys: ["all", "defence"] },
  { key: "munitions", kind: "topic", label: "Munitions production", aliases: ["munition production", "munitions production", "ammunition production", "missile production", "artillery shell production", "weapons stockpile"], lensKeys: ["all", "defence"] },
  { key: "directed-energy", kind: "topic", label: "Directed-energy systems", aliases: ["directed energy", "laser weapon", "high-energy laser", "high energy laser", "microwave weapon"], lensKeys: ["all", "defence"] },
  { key: "military-ai", kind: "topic", label: "Military AI", aliases: ["military ai", "ai-enabled warfare", "ai enabled warfare", "artificial intelligence military", "battlefield ai", "defence ai", "defense ai"], lensKeys: ["all", "defence", "ai"] },
  { key: "nato-readiness", kind: "topic", label: "NATO readiness and collective defence", aliases: ["nato readiness", "collective defence", "collective defense", "nato deterrence", "alliance readiness", "nato capability"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "arctic-security", kind: "topic", label: "Arctic security", aliases: ["arctic security", "arctic defence", "arctic defense", "northern security", "north warning system"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "canadian-defence-procurement", kind: "topic", label: "Canadian defence procurement", aliases: ["canadian defence procurement", "canadian defense procurement", "canada military procurement", "dnd procurement", "canadian armed forces procurement"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "canadian-industrial-policy", kind: "topic", label: "Canadian industrial policy", aliases: ["canadian industrial policy", "canada industrial strategy", "buy canadian", "canadian productivity", "canadian competitiveness"], lensKeys: ["all", "canada-allies"] },
  { key: "venture-capital", kind: "topic", label: "Venture capital", aliases: ["venture capital", "vc funding", "venture funding", "startup funding", "series a", "series b", "seed round"], lensKeys: ["all"] },
  { key: "private-equity", kind: "topic", label: "Private equity", aliases: ["private equity", "buyout fund", "buyout firm", "growth equity"], lensKeys: ["all"] },
  { key: "private-credit", kind: "topic", label: "Private credit", aliases: ["private credit", "direct lending", "private debt"], lensKeys: ["all"] },
  { key: "digital-finance", kind: "topic", label: "Digital finance and stablecoins", aliases: ["stablecoin", "stablecoins", "tokenized finance", "tokenised finance", "digital asset", "instant settlement", "crypto payment"], lensKeys: ["all"] },
  { key: "semiconductors", kind: "topic", label: "Semiconductors and chips", aliases: ["semiconductor", "semiconductors", "chip manufacturing", "chip export", "advanced chips", "gpu market"], lensKeys: ["all", "ai"] },
  { key: "energy-infrastructure", kind: "topic", label: "Energy infrastructure", aliases: ["energy infrastructure", "power grid", "grid capacity", "energy transition", "nuclear energy", "battery storage"], lensKeys: ["all"] },
  { key: "supply-chain-resilience", kind: "topic", label: "Supply-chain resilience", aliases: ["supply chain resilience", "supply-chain resilience", "critical supply chain", "supply disruption", "industrial supply chain"], lensKeys: ["all", "defence"] },
  { key: "workforce-disruption", kind: "topic", label: "Workforce disruption", aliases: ["job losses", "workforce reduction", "mass layoffs", "automation layoffs", "ai layoffs", "workforce disruption"], lensKeys: ["all", "ai"] },
  { key: "european-rearmament", kind: "topic", label: "European rearmament", aliases: ["european rearmament", "europe defence spending", "europe defense spending", "european defence spending", "european defense spending", "european military buildup"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "export-controls", kind: "topic", label: "Export controls and sanctions", aliases: ["export control", "export controls", "technology sanctions", "trade sanctions", "chip restrictions"], lensKeys: ["all", "defence"] },

  // Exact industry language retained alongside broader topics.
  { key: "model-context-protocol", kind: "keyword", label: "Model Context Protocol (MCP)", aliases: ["model context protocol", "mcp"], lensKeys: ["all", "ai"] },
  { key: "remote-code-execution", kind: "keyword", label: "Remote code execution (RCE)", aliases: ["remote code execution", "rce"], lensKeys: ["all", "cyber"] },
  { key: "zero-trust", kind: "keyword", label: "Zero Trust", aliases: ["zero trust"], lensKeys: ["all", "cyber"] },
  { key: "supply-chain", kind: "keyword", label: "Supply chain", aliases: ["supply chain", "supply-chain"], lensKeys: ["all"] },
  { key: "isr", kind: "keyword", label: "ISR", aliases: ["isr"], lensKeys: ["all", "defence"] },
  { key: "uas", kind: "keyword", label: "UAS", aliases: ["uas"], lensKeys: ["all", "defence"] },
  { key: "llm", kind: "keyword", label: "LLM", aliases: ["llm", "llms"], lensKeys: ["all", "ai"] },

  // Organizations and agencies.
  { key: "nato", kind: "organization", label: "NATO", aliases: ["nato", "north atlantic treaty organization", "north atlantic treaty organisation"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "us-dod", kind: "organization", label: "U.S. Department of Defense", aliases: ["department of defense", "department of defence", "pentagon", "dod"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "dnd", kind: "organization", label: "Canadian DND", aliases: ["department of national defence", "department of national defense", "national defence canada", "dnd"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "caf", kind: "organization", label: "Canadian Armed Forces", aliases: ["canadian armed forces", "caf"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "cisa", kind: "organization", label: "CISA", aliases: ["cisa", "cybersecurity and infrastructure security agency"], lensKeys: ["all", "cyber", "canada-allies"] },
  { key: "darpa", kind: "organization", label: "DARPA", aliases: ["darpa", "defense advanced research projects agency", "defence advanced research projects agency"], lensKeys: ["all", "defence", "ai", "canada-allies"] },
  { key: "nsa", kind: "organization", label: "NSA", aliases: ["national security agency", "nsa"], lensKeys: ["all", "cyber", "defence", "canada-allies"] },
  { key: "openai", kind: "organization", label: "OpenAI", aliases: ["openai"], lensKeys: ["all", "ai"] },
  { key: "anthropic", kind: "organization", label: "Anthropic", aliases: ["anthropic"], lensKeys: ["all", "ai"] },
  { key: "google", kind: "organization", label: "Google", aliases: ["google", "google deepmind", "deepmind"], lensKeys: ["all", "ai"] },
  { key: "microsoft", kind: "organization", label: "Microsoft", aliases: ["microsoft"], lensKeys: ["all", "ai", "cyber"] },
  { key: "anduril", kind: "organization", label: "Anduril", aliases: ["anduril", "anduril industries"], lensKeys: ["all", "defence", "ai"] },
  { key: "helsing", kind: "organization", label: "Helsing", aliases: ["helsing"], lensKeys: ["all", "defence", "ai", "canada-allies"] },
  { key: "palantir", kind: "organization", label: "Palantir", aliases: ["palantir", "palantir technologies"], lensKeys: ["all", "defence", "ai"] },
  { key: "lockheed-martin", kind: "organization", label: "Lockheed Martin", aliases: ["lockheed martin"], lensKeys: ["all", "defence"] },
  { key: "bae-systems", kind: "organization", label: "BAE Systems", aliases: ["bae systems", "bae"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "general-dynamics", kind: "organization", label: "General Dynamics", aliases: ["general dynamics"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "rtx", kind: "organization", label: "RTX", aliases: ["rtx", "raytheon"], lensKeys: ["all", "defence"] },
  { key: "diu", kind: "organization", label: "Defense Innovation Unit", aliases: ["defense innovation unit", "defence innovation unit", "diu"], lensKeys: ["all", "defence", "ai"] },
  { key: "knds", kind: "organization", label: "KNDS", aliases: ["knds"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "aws", kind: "organization", label: "Amazon Web Services", aliases: ["amazon web services", "aws"], lensKeys: ["all", "ai", "cyber"] },
  { key: "socom", kind: "organization", label: "U.S. Special Operations Command", aliases: ["special operations command", "ussocom", "socom"], lensKeys: ["all", "defence"] },
  { key: "overland-ai", kind: "organization", label: "Overland AI", aliases: ["overland ai"], lensKeys: ["all", "defence", "ai"] },
  { key: "gao", kind: "organization", label: "U.S. Government Accountability Office", aliases: ["government accountability office", "gao"], lensKeys: ["all", "defence", "canada-allies"] },

  // Named systems and programmes.
  { key: "c-uas", kind: "system", label: "C-UAS", aliases: ["c-uas", "counter-uas", "counter uas"], lensKeys: ["all", "defence"] },
  { key: "f-35", kind: "system", label: "F-35", aliases: ["f-35", "f35", "joint strike fighter"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "b-21", kind: "system", label: "B-21", aliases: ["b-21", "b21 raider"], lensKeys: ["all", "defence"] },
  { key: "himars", kind: "system", label: "HIMARS", aliases: ["himars", "high mobility artillery rocket system"], lensKeys: ["all", "defence"] },
  { key: "patriot", kind: "system", label: "Patriot", aliases: ["patriot missile", "patriot air defence", "patriot air defense"], lensKeys: ["all", "defence"] },
  { key: "jadc2", kind: "programme", label: "JADC2", aliases: ["jadc2", "joint all-domain command and control", "joint all domain command and control"], lensKeys: ["all", "defence", "ai"] },
  { key: "cmmc", kind: "programme", label: "CMMC", aliases: ["cmmc", "cybersecurity maturity model certification"], lensKeys: ["all", "cyber", "defence"] },
  { key: "aukus", kind: "programme", label: "AUKUS", aliases: ["aukus"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "norad-modernization", kind: "programme", label: "NORAD modernization", aliases: ["norad modernization", "norad modernisation", "norad renewal"], lensKeys: ["all", "defence", "canada-allies"] },
  { key: "cca", kind: "programme", label: "Collaborative Combat Aircraft (CCA)", aliases: ["collaborative combat aircraft", "cca"], lensKeys: ["all", "defence", "ai"] },
  { key: "chatgpt", kind: "system", label: "ChatGPT", aliases: ["chatgpt"], lensKeys: ["all", "ai"] },
  { key: "claude", kind: "system", label: "Claude", aliases: ["claude", "claude code"], lensKeys: ["all", "ai"] },
  { key: "gemini", kind: "system", label: "Gemini", aliases: ["gemini", "google gemini"], lensKeys: ["all", "ai"] },
  { key: "grok", kind: "system", label: "Grok", aliases: ["grok", "xai grok"], lensKeys: ["all", "ai"] },
  { key: "cursor", kind: "system", label: "Cursor", aliases: ["cursor ai", "cursor editor", "cursor agent"], lensKeys: ["all", "ai"] },
  { key: "starlink", kind: "system", label: "Starlink", aliases: ["starlink"], lensKeys: ["all", "defence"] },
];

export const SIGNAL_DEFINITIONS = DEFINITIONS.map((definition) => ({
  ...definition,
  aliases: [...new Set([definition.label, ...definition.aliases].map(normalizeSignalText).filter(Boolean))],
  lensKeys: [...new Set(["all" as const, ...definition.lensKeys])],
}));

const DEFINITION_LABELS = new Set(SIGNAL_DEFINITIONS.map((definition) => normalizeSignalText(definition.label)));
const NON_TOPIC_DEFINITION_ALIASES = new Set(
  SIGNAL_DEFINITIONS
    .filter((definition) => definition.kind !== "topic")
    .flatMap((definition) => definition.aliases),
);
const ALL_DEFINITION_ALIASES = new Set(SIGNAL_DEFINITIONS.flatMap((definition) => definition.aliases));

export function normalizeSignalText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[’']/gu, "")
    .replace(/&amp;/giu, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function padded(value: string) {
  return ` ${normalizeSignalText(value)} `;
}

function occurrences(text: string, phrase: string) {
  const needle = ` ${phrase} `;
  let count = 0;
  let cursor = 0;
  while (count < 5) {
    const index = text.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + needle.length;
  }
  return count;
}

export function isBlockedSignalLabel(label: string) {
  const normalized = normalizeSignalText(label);
  if (!normalized || BLOCKED_SIGNAL_LABELS.has(normalized)) return true;
  if (/^(?:19|20)\d{2}$/u.test(normalized) || /^\d+(?:\.\d+)?$/u.test(normalized)) return true;
  if (/^(?:fy|q)[0-9]{1,4}$/u.test(normalized)) return true;
  if (/^(?:s 1|10 k|10 q|8 k)$/u.test(normalized)) return true;
  const tokens = normalized.split(" ");
  return tokens.length > 1 && tokens.every((token) => BLOCKED_SIGNAL_LABELS.has(token));
}

export function isObviousBoilerplateDocument(title: string, contentText: string) {
  const normalizedTitle = normalizeSignalText(title);
  if (!normalizedTitle) return true;
  if (BLOCKED_SIGNAL_LABELS.has(normalizedTitle) && normalizedTitle.split(" ").length <= 5) return true;
  if (/^(?:advertisement|events|from the web|highly recommended|jobs|latest issue|more news to know|quick links|sponsored|subscribe|top news|view in browser)$/u.test(normalizedTitle)) return true;
  const wordCount = normalizeSignalText(contentText).split(" ").filter(Boolean).length;
  if (wordCount < 12 && normalizedTitle.split(" ").length < 3) return true;
  return false;
}

function formatPhrase(normalized: string) {
  return normalized.split(" ").map((token, index) => {
    const upper = token.toLocaleUpperCase();
    if (ACRONYM_DISPLAY.has(upper)) return upper;
    return index === 0 ? `${token[0]?.toLocaleUpperCase() ?? ""}${token.slice(1)}` : token;
  }).join(" ");
}

function inferredLenses(value: string): IntelligenceSignalLens[] {
  const normalized = normalizeSignalText(value);
  const lenses: IntelligenceSignalLens[] = ["all"];
  if (/\b(?:aircraft|ammunition|army|defence|defense|dod|drone|electronic warfare|military|missile|munition|nato|naval|navy|procurement|radar|strike|submarine|uas|uncrewed|weapon)\b/u.test(normalized)) lenses.push("defence");
  if (/\b(?:ai|artificial intelligence|autonomous|compute|foundation model|gpu|llm|machine learning|robot)\b/u.test(normalized)) lenses.push("ai");
  if (/\b(?:breach|cyber|exploit|identity|malware|ransomware|security|vulnerability|zero trust)\b/u.test(normalized)) lenses.push("cyber");
  if (/\b(?:allied|arctic|canada|canadian|caf|dnd|nato|norad)\b/u.test(normalized)) lenses.push("canada-allies");
  return [...new Set(lenses)];
}

function identifierObservations(title: string, contentText: string) {
  const observations = new Map<string, SignalObservation>();
  const combined = `${title}\n${contentText}`;
  const titleMatches = new Set(title.match(/\b(?:[A-Z]{1,8}(?:-[A-Z0-9]{1,10})+(?:\.\d+)?|[A-Z]{2,8}\d{1,4}(?:\.\d+)?|[A-Z]{3,8})\b/gu) ?? []);
  const matches = combined.match(/\b(?:[A-Z]{1,8}(?:-[A-Z0-9]{1,10})+(?:\.\d+)?|[A-Z]{2,8}\d{1,4}(?:\.\d+)?|[A-Z]{3,8})\b/gu) ?? [];
  for (const display of matches) {
    const normalized = normalizeSignalText(display);
    if (!normalized || IDENTIFIER_EXCLUSIONS.has(normalized) || isBlockedSignalLabel(display)) continue;
    if (!titleMatches.has(display) && !/[0-9-]/u.test(display) && !ACRONYM_DISPLAY.has(display)) continue;
    if (DEFINITION_LABELS.has(normalized) || NON_TOPIC_DEFINITION_ALIASES.has(normalized)) continue;
    const key = `identifier:${normalized.replace(/\s+/gu, "-")}`;
    const existing = observations.get(key);
    if (existing) {
      existing.mentions = Math.min(5, existing.mentions + 1);
      continue;
    }
    observations.set(key, {
      key,
      kind: /[0-9-]/u.test(display) ? "system" : "keyword",
      label: display,
      aliases: [normalized],
      lensKeys: inferredLenses(display),
      extraction: "identifier",
      mentions: 1,
      titleMentions: titleMatches.has(display) ? 1 : 0,
    });
  }
  return observations;
}

function phraseObservations(title: string, contentText: string) {
  const observations = new Map<string, SignalObservation>();
  const titleTokens = normalizeSignalText(title).split(" ").filter(Boolean);
  const content = padded(contentText);
  for (let size = 2; size <= 4; size += 1) {
    for (let start = 0; start + size <= titleTokens.length; start += 1) {
      const tokens = titleTokens.slice(start, start + size);
      if (tokens.some((token) => MONTHS.includes(token) || WEEKDAYS.includes(token))) continue;
      if (PHRASE_EDGE_STOPWORDS.has(tokens[0]!) || PHRASE_EDGE_STOPWORDS.has(tokens.at(-1)!)) continue;
      if (!tokens.some((token) => PHRASE_ANCHORS.has(token))) continue;
      if (tokens.filter((token) => token.length >= 3).length < 2 && !tokens.includes("ai")) continue;
      const normalized = tokens.join(" ");
      if (
        isBlockedSignalLabel(normalized) ||
        DEFINITION_LABELS.has(normalized) ||
        ALL_DEFINITION_ALIASES.has(normalized) ||
        PHRASE_REJECTIONS.some((pattern) => pattern.test(normalized))
      ) continue;
      const key = `phrase:${normalized.replace(/\s+/gu, "-")}`;
      observations.set(key, {
        key,
        kind: "keyword",
        label: formatPhrase(normalized),
        aliases: [normalized],
        lensKeys: inferredLenses(normalized),
        extraction: "phrase",
        mentions: Math.min(5, 1 + occurrences(content, normalized)),
        titleMentions: 1,
      });
    }
  }
  return observations;
}

export function extractSignalObservations(title: string, contentText: string) {
  const observations = new Map<string, SignalObservation>();
  const normalizedTitle = padded(title);
  const normalizedContent = padded(contentText);
  for (const definition of SIGNAL_DEFINITIONS) {
    let titleMentions = 0;
    let mentions = 0;
    for (const alias of definition.aliases) {
      titleMentions += occurrences(normalizedTitle, alias);
      mentions += occurrences(normalizedContent, alias);
    }
    if (!titleMentions && !mentions) continue;
    observations.set(`${definition.kind}:${definition.key}`, {
      ...definition,
      extraction: "taxonomy",
      titleMentions: Math.min(5, titleMentions),
      mentions: Math.min(5, Math.max(1, titleMentions + mentions)),
    });
  }
  for (const observation of identifierObservations(title, contentText).values()) {
    if (![...observations.values()].some((existing) => normalizeSignalText(existing.label) === normalizeSignalText(observation.label))) {
      observations.set(observation.key, observation);
    }
  }
  for (const observation of phraseObservations(title, contentText).values()) {
    observations.set(observation.key, observation);
  }
  return observations;
}

export function genericWhyItMatters(definition: Pick<SignalDefinition, "kind" | "label" | "lensKeys">) {
  if (definition.kind === "organization") return `Broader attention around ${definition.label} can indicate a shift in who is funding, buying, building, regulating, or deploying capabilities.`;
  if (definition.kind === "system") return `Movement around ${definition.label} can reveal changing demand, adoption, operational use, or competitive positioning for a specific system.`;
  if (definition.kind === "programme") return `Changes in coverage of ${definition.label} can signal movement in funding, milestones, procurement, delivery, or policy.`;
  if (definition.lensKeys.includes("defence")) return `This can affect capability priorities, procurement demand, industrial capacity, and operational readiness.`;
  if (definition.lensKeys.includes("cyber")) return `This can change the threat picture, defensive priorities, compliance burden, and security investment.`;
  if (definition.lensKeys.includes("ai")) return `This can change where AI capability, investment, adoption, and competitive advantage are accumulating.`;
  return `A sustained change in this area can reveal shifting investment, operating priorities, regulation, or market demand.`;
}

export function genericWhatToWatch(definition: Pick<SignalDefinition, "kind" | "label">) {
  if (definition.kind === "organization") return `Watch for announcements, contracts, funding, partnerships, leadership decisions, and deployments involving ${definition.label}.`;
  if (definition.kind === "system") return `Watch for buyers, evaluations, contract awards, trials, deployments, upgrades, and competing systems tied to ${definition.label}.`;
  if (definition.kind === "programme") return `Watch for budgets, solicitations, awards, delivery dates, scope changes, and operational milestones for ${definition.label}.`;
  return `Watch for named buyers, funding, contracts, trials, deployments, policy changes, and repeated independent reporting tied to ${definition.label}.`;
}

export function auditSignalLabels(signals: Array<{ label: string; kind: IntelligenceSignalKind }>) {
  const blocked = signals.filter((signal) => isBlockedSignalLabel(signal.label));
  const kindCounts = Object.fromEntries(
    ["topic", "keyword", "organization", "system", "programme"].map((kind) => [
      kind,
      signals.filter((signal) => signal.kind === kind).length,
    ]),
  );
  return {
    total: signals.length,
    blocked,
    kindCounts,
    meaningfulRate: signals.length ? (signals.length - blocked.length) / signals.length : 0,
  };
}
