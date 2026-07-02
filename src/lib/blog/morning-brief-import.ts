export type BlogImportSourceLink = {
  label: string;
  url: string;
  note?: string;
};

export type MorningBriefTransformInput = {
  fileName: string;
  json: unknown;
  markdown?: string;
};

export type MorningBriefBlogDraft = {
  rawFileName: string;
  reportDate: string;
  title: string;
  slug: string;
  excerpt: string;
  seoTitle: string;
  metaDescription: string;
  focusTopic: string;
  tags: string[];
  answerSummary: string;
  sourceLinks: BlogImportSourceLink[];
  relatedWikiSlugs: string[];
  contentJson: Record<string, unknown>;
  contentHtml: string;
};

type JsonRecord = Record<string, unknown>;

type RichTextNode = Record<string, unknown>;

type InlineSegment = {
  text: string;
  href?: string;
};

type ContentBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; content: InlineSegment[] }
  | { type: "bulletList"; items: InlineSegment[][] };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const GENERIC_TITLES = new Set([
  "high signal reading brief",
  "morning brief premium editorial edition",
  "newsletter signal report premium editorial",
  "newsletter signal report premium editorial edition",
]);

export const DEFAULT_MORNING_BRIEF_SOURCE =
  "/Users/andrewdavies/Library/Mobile Documents/iCloud~md~obsidian/Documents/Andrew's Vault/Morning Brief/raw";

export class MorningBriefImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MorningBriefImportError";
  }
}

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  if (typeof value === "string") return [value.trim()].filter(Boolean);
  return asArray(value)
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeMorningBriefSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function compactText(input: string, maxLength: number) {
  const text = normalizeText(input);
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = (lastSpace > maxLength * 0.55 ? cut.slice(0, lastSpace) : cut)
    .trim()
    .replace(/[.,;:!?-]+$/, "");

  return `${trimmed}.`;
}

function normalizeDate(value: string, fileName: string) {
  const match =
    value.match(/^\d{4}-\d{2}-\d{2}$/) ?? fileName.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) {
    throw new MorningBriefImportError(`Missing report_date for ${fileName}.`);
  }

  const date = match[0];
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new MorningBriefImportError(`Invalid report_date "${date}" in ${fileName}.`);
  }
  return date;
}

export function formatReportDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function markdownFirstHeading(markdown = "") {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.(json|md)$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/-/g, " ");
}

function titleCase(input: string) {
  return input
    .split(/\s+/g)
    .filter(Boolean)
    .map((word) => {
      if (/^(ai|api|aws|fca|usd|uk|us|nato|cisa|pqc|mcp)$/i.test(word)) {
        return word.toUpperCase();
      }
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function cleanTopic(input: string) {
  const cleaned = normalizeText(input)
    .replace(/^\d{4}-\d{2}-\d{2}[-\s:]*/i, "")
    .replace(/^andrew'?s morning brief\s*[-:]\s*/i, "")
    .replace(/^newsletter signal report\s*[-:]\s*/i, "Newsletter Signal Report ")
    .replace(/\s*-\s*\d{4}-\d{2}-\d{2}$/i, "")
    .replace(/\s*-\s*\d{1,2}_[A-Za-z]{3}_\d{4}$/i, "")
    .replace(/\s+premium editorial edition$/i, " Premium Editorial Edition")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:-]+$/g, "")
    .trim();

  return /[A-Z]/.test(cleaned) ? cleaned : titleCase(cleaned);
}

function deriveTopic(data: JsonRecord, markdown: string | undefined, fileName: string) {
  const candidates = [
    asString(data.report_title),
    asString(data.title),
    asString(data.subtitle),
    markdownFirstHeading(markdown),
    titleFromFileName(fileName),
  ];

  for (const candidate of candidates) {
    const topic = cleanTopic(candidate);
    const normalized = topic.toLowerCase();
    if (topic && !GENERIC_TITLES.has(normalized)) return topic;
  }

  return "Newsletter Signal Report";
}

function inferAnswerSummary(data: JsonRecord) {
  const bottomLine = asString(data.bottom_line);
  if (bottomLine) return compactText(bottomLine, 320);

  const firstSignal = asRecord(asArray(data.executive_signals)[0]);
  const heading = asString(firstSignal.heading);
  const detail = asString(firstSignal.detail);
  if (heading && detail) return compactText(`${heading}: ${detail}`, 320);
  if (detail) return compactText(detail, 320);

  return "This Morning Brief identifies the strongest source-backed signals from the day and turns them into a public strategy note with references preserved.";
}

function articleRecords(data: JsonRecord) {
  return asArray(data.articles).map(asRecord).filter((article) => asString(article.title));
}

function fullSearchText(data: JsonRecord, topic: string) {
  const parts = [topic, asString(data.bottom_line)];
  for (const signal of asArray(data.executive_signals).map(asRecord)) {
    parts.push(asString(signal.heading), asString(signal.detail));
  }
  for (const article of articleRecords(data)) {
    parts.push(
      asString(article.theme),
      asString(article.title),
      asString(article.source),
      asString(article.why_it_stood_out),
      asString(article.so_what),
      asString(article.your_action),
      ...asStringArray(article.summary),
    );
  }
  return parts.join(" ").toLowerCase();
}

function inferTags(data: JsonRecord, searchText: string) {
  const tags = new Set<string>(["morning brief", "source-backed research"]);
  const themeCounts = new Map<string, number>();

  for (const article of articleRecords(data)) {
    const theme = asString(article.theme).toUpperCase();
    if (!theme) continue;
    themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
  }

  const themeTags: Record<string, string> = {
    CHANGE: "technology change",
    INDUSTRY: "industry signals",
    OPPORTUNITY: "opportunity discovery",
    RISK: "risk intelligence",
    STRATEGY: "strategy",
  };

  Array.from(themeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([theme]) => {
      const tag = themeTags[theme];
      if (tag) tags.add(tag);
    });

  if (/\b(agent|ai|model|llm|openai|anthropic|automation)\b/i.test(searchText)) {
    tags.add("AI strategy");
  }
  if (/\b(cyber|security|vulnerability|cisa|breach)\b/i.test(searchText)) {
    tags.add("cybersecurity");
  }
  if (/\b(defen[cs]e|military|pentagon|drone|sovereign|nato)\b/i.test(searchText)) {
    tags.add("defence");
  }
  if (/\b(crypto|stablecoin|capital|market|finance|bank|fca)\b/i.test(searchText)) {
    tags.add("markets");
  }

  return Array.from(tags).slice(0, 8);
}

function inferRelatedWikiSlugs(searchText: string) {
  const slugs: string[] = [];
  const add = (slug: string) => {
    if (!slugs.includes(slug)) slugs.push(slug);
  };

  if (/\b(agent|agents|agentic|automation|workflow|llm|model)\b/i.test(searchText)) {
    add("agentic-engineering");
    add("ai-automation-builders");
  }
  if (/\b(safety|control|governance|eval|assurance|trust)\b/i.test(searchText)) {
    add("ai-safety-and-control");
    add("trust-boundaries-and-assurance");
  }
  if (/\b(cyber|security|vulnerability|breach|cisa|quantum)\b/i.test(searchText)) {
    add("cybersecurity-boundaries");
  }
  if (/\b(defen[cs]e|military|pentagon|drone|sovereign|allied|nato)\b/i.test(searchText)) {
    add("sovereignty-and-critical-infrastructure");
    add("sovereign-defence-manufacturing");
  }
  if (/\b(crypto|stablecoin|capital|market|finance|bank|commerce|venture)\b/i.test(searchText)) {
    add("money-wealth-and-markets");
    add("venture-opportunity-discovery");
  }

  add("research-leads");
  return slugs.slice(0, 5);
}

function cleanUrl(raw: string, context: string) {
  const value = raw.trim();
  if (!value) return "";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MorningBriefImportError(`Invalid URL in ${context}: ${value}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MorningBriefImportError(`Invalid URL protocol in ${context}: ${value}`);
  }

  return url.toString();
}

function collectSourceLinks(data: JsonRecord, fileName: string) {
  const links: BlogImportSourceLink[] = [];
  const seen = new Set<string>();

  const add = (label: string, rawUrl: string, note?: string) => {
    if (!rawUrl.trim()) return;
    const url = cleanUrl(rawUrl, fileName);
    const key = url.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      label: compactText(label || url, 120),
      url,
      ...(note ? { note: compactText(note, 180) } : {}),
    });
  };

  const groundingLens = asRecord(data.grounding_lens);
  add(
    asString(groundingLens.title),
    asString(groundingLens.url),
    asString(groundingLens.source) || "Grounding lens",
  );

  for (const article of articleRecords(data)) {
    add(
      asString(article.title),
      asString(article.url),
      [asString(article.source), asString(article.theme)].filter(Boolean).join(" / "),
    );
  }

  for (const related of asArray(data.related_links).map(asRecord)) {
    add(
      asString(related.title),
      asString(related.url),
      asString(related.detail) || "Related reference",
    );
  }

  return links;
}

function inlineText(text: string): InlineSegment[] {
  const normalized = normalizeText(text);
  return normalized ? [{ text: normalized }] : [];
}

function inlineLink(text: string, href: string): InlineSegment {
  return { text: normalizeText(text), href };
}

function paragraph(text: string): ContentBlock | null {
  const content = inlineText(text);
  return content.length ? { type: "paragraph", content } : null;
}

function paragraphParts(content: InlineSegment[]): ContentBlock | null {
  const cleaned = content
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, " ") }))
    .filter((item) => item.text.trim());
  return cleaned.length ? { type: "paragraph", content: cleaned } : null;
}

function heading(level: 2 | 3, text: string): ContentBlock {
  return { type: "heading", level, text };
}

function bulletList(items: InlineSegment[][]): ContentBlock | null {
  const cleaned = items
    .map((item) =>
      item
        .map((part) => ({ ...part, text: part.text.replace(/\s+/g, " ") }))
        .filter((part) => part.text.trim()),
    )
    .filter((item) => item.length > 0);
  return cleaned.length ? { type: "bulletList", items: cleaned } : null;
}

function pushBlock(blocks: ContentBlock[], block: ContentBlock | null) {
  if (block) blocks.push(block);
}

function buildContentBlocks(data: JsonRecord, reportDate: string, topic: string) {
  const blocks: ContentBlock[] = [];
  const formattedDate = formatReportDate(reportDate);
  const coverageWindow = asString(data.coverage_window);
  const answerSummary = inferAnswerSummary(data);

  pushBlock(
    blocks,
    paragraph(
      coverageWindow
        ? `This Morning Brief covers ${coverageWindow}. It preserves the source trail behind the day's strongest signals and frames them for public strategy readers.`
        : `This Morning Brief was published for ${formattedDate}. It preserves the source trail behind the day's strongest signals and frames them for public strategy readers.`,
    ),
  );
  pushBlock(blocks, paragraph(answerSummary));

  const executiveSignals = asArray(data.executive_signals).map(asRecord);
  if (executiveSignals.length > 0) {
    blocks.push(heading(2, "Executive Signals"));
    pushBlock(
      blocks,
      bulletList(
        executiveSignals.map((signal) => {
          const headingText = asString(signal.heading);
          const detail = asString(signal.detail);
          return inlineText(headingText && detail ? `${headingText}: ${detail}` : headingText || detail);
        }),
      ),
    );
  }

  const groundingLens = asRecord(data.grounding_lens);
  if (asString(groundingLens.title)) {
    blocks.push(heading(2, "Grounding Lens"));
    const lensUrl = asString(groundingLens.url);
    pushBlock(
      blocks,
      paragraphParts([
        { text: "Source: " },
        lensUrl
          ? inlineLink(asString(groundingLens.title), cleanUrl(lensUrl, `${topic} grounding lens`))
          : { text: asString(groundingLens.title) },
        asString(groundingLens.source) ? { text: ` (${asString(groundingLens.source)})` } : { text: "" },
      ]),
    );
    pushBlock(blocks, paragraph(asString(groundingLens.core_idea)));
    pushBlock(blocks, paragraph(asString(groundingLens.challenges)));
    pushBlock(blocks, paragraph(asString(groundingLens.judgment_value)));
    pushBlock(blocks, paragraph(asString(groundingLens.practice)));
  }

  const articles = articleRecords(data);
  if (articles.length > 0) {
    blocks.push(heading(2, "Anchor Articles"));
    articles.forEach((article, index) => {
      const title = asString(article.title);
      const url = cleanUrl(asString(article.url), `${topic} article ${index + 1}`);
      blocks.push(heading(3, `${String(index + 1).padStart(2, "0")}. ${title}`));
      pushBlock(
        blocks,
        paragraphParts([
          { text: "Source: " },
          inlineLink(asString(article.source) || title, url),
          asString(article.theme) ? { text: ` / ${asString(article.theme)}` } : { text: "" },
        ]),
      );
      pushBlock(blocks, paragraph(asString(article.why_it_stood_out)));
      pushBlock(blocks, paragraph(asString(article.your_action)));
      pushBlock(blocks, paragraph(asString(article.so_what)));
      for (const summary of asStringArray(article.summary)) {
        pushBlock(blocks, paragraph(summary));
      }
    });
  }

  const sectorMap = asArray(data.sector_map).map(asRecord).filter((item) => asString(item.sector));
  if (sectorMap.length > 0) {
    blocks.push(heading(2, "Sector Map"));
    for (const sector of sectorMap) {
      blocks.push(heading(3, asString(sector.sector)));
      pushBlock(blocks, paragraph(asString(sector.signal)));
      pushBlock(blocks, paragraph(asString(sector.watch_next)));
      pushBlock(
        blocks,
        bulletList(asStringArray(sector.entities).map((entity) => inlineText(entity))),
      );
    }
  }

  const entityCards = asArray(data.entity_cards).map(asRecord).filter((item) => asString(item.name));
  if (entityCards.length > 0) {
    blocks.push(heading(2, "Entity Register"));
    for (const entity of entityCards) {
      blocks.push(heading(3, asString(entity.name)));
      pushBlock(blocks, paragraph(asString(entity.role_in_story)));
      pushBlock(blocks, paragraph(asString(entity.why_it_matters)));
      pushBlock(
        blocks,
        bulletList(asStringArray(entity.follow_up_questions).map((question) => inlineText(question))),
      );
    }
  }

  const relatedLinks = asArray(data.related_links).map(asRecord).filter((item) => asString(item.url));
  if (relatedLinks.length > 0) {
    blocks.push(heading(2, "Related Links"));
    pushBlock(
      blocks,
      bulletList(
        relatedLinks.map((link) => {
          const title = asString(link.title) || asString(link.url);
          const detail = asString(link.detail);
          const url = cleanUrl(asString(link.url), `${topic} related link`);
          return [
            inlineLink(title, url),
            ...(detail ? inlineText(` - ${detail}`) : []),
          ];
        }),
      ),
    );
  }

  return blocks;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(input: string) {
  return escapeHtml(input).replace(/`/g, "&#96;");
}

function renderInlineHtml(parts: InlineSegment[]) {
  return parts
    .map((part) => {
      const text = escapeHtml(part.text);
      if (!part.href) return text;
      return `<a href="${escapeAttribute(part.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    })
    .join("");
}

function blocksToHtml(blocks: ContentBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === "heading") {
        return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      }
      if (block.type === "paragraph") {
        return `<p>${renderInlineHtml(block.content)}</p>`;
      }
      return `<ul>${block.items
        .map((item) => `<li><p>${renderInlineHtml(item)}</p></li>`)
        .join("")}</ul>`;
    })
    .join("\n");
}

function textNode(value: string, href?: string): RichTextNode {
  return {
    type: "text",
    text: value,
    ...(href
      ? {
          marks: [
            {
              type: "link",
              attrs: {
                href,
                target: "_blank",
                rel: "noopener noreferrer",
                class: null,
              },
            },
          ],
        }
      : {}),
  };
}

function inlineToRichText(parts: InlineSegment[]) {
  return parts.map((part) => textNode(part.text, part.href));
}

function blocksToContentJson(blocks: ContentBlock[]) {
  const content = blocks.map((block) => {
    if (block.type === "heading") {
      return {
        type: "heading",
        attrs: { level: block.level },
        content: [textNode(block.text)],
      };
    }
    if (block.type === "paragraph") {
      return {
        type: "paragraph",
        content: inlineToRichText(block.content),
      };
    }
    return {
      type: "bulletList",
      content: block.items.map((item) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: inlineToRichText(item),
          },
        ],
      })),
    };
  });

  return { type: "doc", content };
}

function assertNoPrivatePaths(draft: Pick<MorningBriefBlogDraft, "contentHtml" | "answerSummary" | "excerpt">) {
  const publicText = `${draft.contentHtml} ${draft.answerSummary} ${draft.excerpt}`;
  if (/\/Users\/andrewdavies\//.test(publicText)) {
    throw new MorningBriefImportError("Public blog draft contains a local filesystem path.");
  }
}

export function transformMorningBriefReport(input: MorningBriefTransformInput): MorningBriefBlogDraft {
  const data = asRecord(input.json);
  const reportDate = normalizeDate(asString(data.report_date), input.fileName);
  const topic = deriveTopic(data, input.markdown, input.fileName);
  const formattedDate = formatReportDate(reportDate);
  const title = `${topic}: Morning Brief, ${formattedDate}`;
  const slugBase = normalizeMorningBriefSlug(topic) || "morning-brief";
  const slug = `${slugBase}-${reportDate}`;
  const answerSummary = inferAnswerSummary(data);
  const searchText = fullSearchText(data, topic);
  const blocks = buildContentBlocks(data, reportDate, topic);
  const sourceLinks = collectSourceLinks(data, input.fileName);

  const draft: MorningBriefBlogDraft = {
    rawFileName: input.fileName,
    reportDate,
    title,
    slug,
    excerpt: compactText(answerSummary, 230),
    seoTitle: compactText(title, 78),
    metaDescription: compactText(answerSummary, 158),
    focusTopic: topic,
    tags: inferTags(data, searchText),
    answerSummary,
    sourceLinks,
    relatedWikiSlugs: inferRelatedWikiSlugs(searchText),
    contentJson: blocksToContentJson(blocks),
    contentHtml: blocksToHtml(blocks),
  };

  assertNoPrivatePaths(draft);
  return draft;
}

export function assertUniqueMorningBriefSlugs(drafts: MorningBriefBlogDraft[]) {
  const seen = new Map<string, string>();
  for (const draft of drafts) {
    const existing = seen.get(draft.slug);
    if (existing) {
      throw new MorningBriefImportError(
        `Duplicate generated slug "${draft.slug}" for ${existing} and ${draft.rawFileName}.`,
      );
    }
    seen.set(draft.slug, draft.rawFileName);
  }
}
