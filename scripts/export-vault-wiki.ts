import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Frontmatter = Record<string, string | string[] | boolean>;

type ChartSpec = {
  id: string;
  title: string;
  headers: string[];
  labels: string[];
  values: number[];
};

type ExportedPage = {
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
  charts: ChartSpec[];
  heroImage: string;
  contentHash: string;
};

type ExportIndex = {
  generatedAt: string;
  sourceLabel: string;
  pages: ExportedPage[];
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

const DEFAULT_OUT = "src/content/wiki/generated";
const DEFAULT_IMAGE_OUT = "public/wiki/generated-images";

function argValue(name: string, fallback: string) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function titleFromFilename(file: string) {
  return path.basename(file, ".md").replace(/[-_]+/g, " ");
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  if (!raw.startsWith("---\n")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { frontmatter: {}, body: raw };
  const frontmatter: Frontmatter = {};
  const yaml = raw.slice(4, end).split(/\r?\n/);
  let activeArrayKey: string | null = null;
  for (const line of yaml) {
    const arrayMatch = line.match(/^\s*-\s+(.+)$/);
    if (arrayMatch && activeArrayKey) {
      const current = frontmatter[activeArrayKey];
      frontmatter[activeArrayKey] = [
        ...(Array.isArray(current) ? current : []),
        arrayMatch[1].trim(),
      ];
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    activeArrayKey = null;
    if (!value) {
      frontmatter[key] = [];
      activeArrayKey = key;
    } else if (value === "true" || value === "false") {
      frontmatter[key] = value === "true";
    } else {
      frontmatter[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter, body: raw.slice(end + 4).trimStart() };
}

function isFalseFlag(value: Frontmatter[string] | undefined) {
  if (value === false) return true;
  if (typeof value === "string") return value.trim().toLowerCase() === "false";
  return false;
}

function isPublicPage(frontmatter: Frontmatter) {
  return !(
    isFalseFlag(frontmatter.public) ||
    isFalseFlag(frontmatter.kb_public) ||
    isFalseFlag(frontmatter.publish)
  );
}

function firstHeading(body: string) {
  const match = body.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function stripMarkdown(input: string) {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/\[\[([^|\]]+)\|([^\]]+)]]/g, "$2")
    .replace(/\[\[([^\]]+)]]/g, "$1")
    .replace(/[#>*_`|[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(body: string) {
  return Array.from(body.matchAll(/^(#{1,3})\s+(.+)$/gm)).map((match) => {
    const text = match[2].replace(/#+$/, "").trim();
    return {
      level: match[1].length,
      text,
      id: slugify(text),
    };
  });
}

function sectionLines(body: string, heading: string) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

function extractSourceNotes(body: string) {
  return sectionLines(body, "Source notes")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function extractWikilinks(body: string) {
  const out = new Set<string>();
  for (const match of body.matchAll(/\[\[([^|\]]+)(?:\|[^\]]+)?]]/g)) {
    out.add(match[1].trim());
  }
  return Array.from(out);
}

function convertWikilinks(body: string, titleToSlug: Map<string, string>) {
  return body.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?]]/g, (_, target, label) => {
    const cleanTarget = String(target).trim();
    const cleanLabel = String(label || target).trim();
    const slug = titleToSlug.get(cleanTarget);
    return slug ? `[${cleanLabel}](/wiki/${slug})` : cleanLabel;
  });
}

function parseNumericCell(value: string): number | null {
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!cleaned) return null;
  const parsed = Number(cleaned[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTables(markdown: string, pageSlug: string): ChartSpec[] {
  const lines = markdown.split(/\r?\n/);
  const charts: ChartSpec[] = [];
  for (let i = 0; i < lines.length - 2; i += 1) {
    if (!lines[i].trim().startsWith("|")) continue;
    if (!/^\s*\|?\s*:?-{3,}:?\s*\|/.test(lines[i + 1])) continue;
    const rows: string[][] = [];
    let j = i;
    while (j < lines.length && lines[j].trim().startsWith("|")) {
      rows.push(
        lines[j]
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
      j += 1;
    }
    const headers = rows[0] ?? [];
    const dataRows = rows.slice(2).filter((row) => row.length >= 2);
    for (let col = 1; col < headers.length; col += 1) {
      const points = dataRows
        .map((row) => ({
          label: row[0] || "Item",
          value: parseNumericCell(String(row[col] ?? "")),
        }))
        .filter((point): point is { label: string; value: number } => point.value !== null);
      if (points.length >= 2) {
        charts.push({
          id: `${pageSlug}-chart-${charts.length + 1}`,
          title: headers[col] || "Comparison",
          headers,
          labels: points.map((point) => point.label),
          values: points.map((point) => point.value),
        });
        break;
      }
    }
    i = j;
  }
  return charts.slice(0, 3);
}

function getDescription(body: string) {
  const quote = body.match(/^>\s+(.+)$/m)?.[1]?.trim();
  if (quote) return quote.replace(/\*\*/g, "");
  const paragraph = body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !block.startsWith("#") && !block.startsWith("---"));
  return stripMarkdown(paragraph ?? "").slice(0, 220);
}

function xmlEscape(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clusterColor(cluster: string) {
  const colors = [
    ["#263238", "#d69d45"],
    ["#233047", "#6fb1c8"],
    ["#2e3d32", "#7cad72"],
    ["#3a2f3e", "#c890b9"],
    ["#3d3327", "#c88f5a"],
    ["#23383a", "#71b7a8"],
  ];
  const hash = Array.from(cluster).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function writeHeroImage(page: ExportedPage, imageDir: string) {
  const [base, accent] = clusterColor(page.cluster);
  const title = xmlEscape(page.title);
  const cluster = xmlEscape(page.cluster || "wiki");
  const role = xmlEscape(page.role || "page");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8f3e8"/>
      <stop offset="0.58" stop-color="#eee4d2"/>
      <stop offset="1" stop-color="#dce7e5"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#111827" flood-opacity="0.12"/>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="88" y="84" width="1024" height="462" rx="28" fill="#fffdf8" stroke="#d8cdbb" filter="url(#shadow)"/>
  <path d="M142 444 C280 328, 380 454, 520 340 S800 236, 1028 316" fill="none" stroke="${accent}" stroke-width="10" stroke-linecap="round" opacity="0.7"/>
  <path d="M184 392 C318 256, 478 340, 610 250 S790 202, 964 246" fill="none" stroke="${base}" stroke-width="3" stroke-linecap="round" opacity="0.28"/>
  <g fill="${base}" opacity="0.92">
    <circle cx="184" cy="392" r="13"/>
    <circle cx="372" cy="362" r="13"/>
    <circle cx="610" cy="250" r="13"/>
    <circle cx="832" cy="226" r="13"/>
    <circle cx="964" cy="246" r="13"/>
  </g>
  <text x="142" y="158" fill="${base}" font-family="Inter, ui-sans-serif, system-ui" font-size="18" font-weight="700" letter-spacing="4">${cluster.toUpperCase()} / ${role.toUpperCase()}</text>
  <foreignObject x="140" y="190" width="700" height="190">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Inter, ui-sans-serif, system-ui; color: ${base}; font-size: 56px; line-height: 1.02; font-weight: 760; letter-spacing: -1px;">${title}</div>
  </foreignObject>
  <text x="142" y="506" fill="#6b6358" font-family="Inter, ui-sans-serif, system-ui" font-size="24">${page.wordCount.toLocaleString()} words · ${page.readingMinutes} min read · ${page.sourceNotes.length} source notes</text>
</svg>`;
  fs.writeFileSync(path.join(imageDir, `${page.slug}.svg`), svg);
}

function ensureCleanDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const sourceArg = argValue("--source", process.env.WIKI_ROOT || "");
  if (!sourceArg) {
    throw new Error("Wiki source root is required. Pass --source <wiki-root> or set WIKI_ROOT.");
  }
  const sourceRoot = path.resolve(sourceArg);
  const wikiDir = path.join(sourceRoot, "wiki");
  const outDir = path.resolve(argValue("--out", DEFAULT_OUT));
  const pageDir = path.join(outDir, "pages");
  const imageDir = path.resolve(argValue("--image-out", DEFAULT_IMAGE_OUT));

  if (!fs.existsSync(wikiDir)) {
    throw new Error(`Wiki directory not found: ${wikiDir}`);
  }

  ensureCleanDir(pageDir);
  ensureCleanDir(imageDir);

  const sourceFiles = fs
    .readdirSync(wikiDir)
    .filter((file) => file.endsWith(".md"))
    .filter((file) => !["index.md", "log.md"].includes(file))
    .sort();

  const parsedPages = sourceFiles.map((file) => {
    const fullPath = path.join(wikiDir, file);
    const raw = fs.readFileSync(fullPath, "utf8");
    const { frontmatter, body } = parseFrontmatter(raw);
    const title = firstHeading(body) || titleFromFilename(file);
    return { file, fullPath, raw, frontmatter, body, title, slug: slugify(title) };
  });
  const skippedPrivatePages = parsedPages
    .filter((page) => !isPublicPage(page.frontmatter))
    .map((page) => page.file);
  const rawPages = parsedPages.filter((page) => isPublicPage(page.frontmatter));

  const titleToSlug = new Map(rawPages.map((page) => [page.title, page.slug]));
  const exportedPages: ExportedPage[] = rawPages.map((page) => {
    const markdown = convertWikilinks(page.body, titleToSlug);
    const plainText = stripMarkdown(markdown);
    const wordCount = plainText ? plainText.split(/\s+/).length : 0;
    const relatedTitles = extractWikilinks(page.body);
    const linkedSlugs = relatedTitles
      .map((title) => titleToSlug.get(title))
      .filter((slug): slug is string => Boolean(slug));
    const role = String(page.frontmatter.kb_role || "reference");
    const cluster = String(page.frontmatter.kb_cluster || "general");
    const exported: ExportedPage = {
      slug: page.slug,
      title: page.title,
      description: getDescription(page.body),
      role,
      cluster,
      visualStatus: String(page.frontmatter.visual_status || "none"),
      headings: extractHeadings(page.body),
      related: relatedTitles.filter((title) => titleToSlug.has(title)),
      linkedSlugs: Array.from(new Set(linkedSlugs)),
      sourceNotes: extractSourceNotes(page.body),
      markdown,
      plainText,
      wordCount,
      readingMinutes: Math.max(1, Math.round(wordCount / 225)),
      charts: parseTables(markdown, page.slug),
      heroImage: `/wiki/generated-images/${page.slug}.svg`,
      contentHash: crypto.createHash("sha256").update(page.raw).digest("hex"),
    };
    writeHeroImage(exported, imageDir);
    fs.writeFileSync(
      path.join(pageDir, `${page.slug}.json`),
      JSON.stringify(exported, null, 2) + "\n",
    );
    return exported;
  });

  const clusters = Array.from(
    exportedPages.reduce((map, page) => {
      map.set(page.cluster, (map.get(page.cluster) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).map(([id, count]) => ({ id, label: id, count }));
  const roles = Array.from(
    exportedPages.reduce((map, page) => {
      map.set(page.role, (map.get(page.role) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).map(([id, count]) => ({ id, label: id, count }));
  const edgeSet = new Set<string>();
  for (const page of exportedPages) {
    for (const target of page.linkedSlugs) {
      if (target !== page.slug) edgeSet.add(`${page.slug}::${target}`);
    }
  }

  const index: ExportIndex = {
    generatedAt: new Date().toISOString(),
    sourceLabel: path.basename(sourceRoot),
    pages: exportedPages.map((page) => ({
      ...page,
      markdown: "",
      plainText: page.plainText,
    })),
    clusters,
    roles,
    graph: {
      nodes: exportedPages.map((page) => ({
        id: page.slug,
        title: page.title,
        cluster: page.cluster,
        role: page.role,
        href: `/wiki/${page.slug}`,
      })),
      edges: Array.from(edgeSet).map((edge) => {
        const [source, target] = edge.split("::");
        return { source, target };
      }),
    },
  };

  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "all-pages.json"), JSON.stringify(exportedPages, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "search-index.json"),
    JSON.stringify(
      exportedPages.map((page) => ({
        slug: page.slug,
        title: page.title,
        description: page.description,
        cluster: page.cluster,
        role: page.role,
        text: page.plainText,
        href: `/wiki/${page.slug}`,
      })),
      null,
      2,
    ) + "\n",
  );

  console.log(
    JSON.stringify(
      {
        sourceRoot,
        pages: exportedPages.length,
        skippedPrivatePages: skippedPrivatePages.length,
        clusters: clusters.length,
        roles: roles.length,
        outDir,
        imageDir,
      },
      null,
      2,
    ),
  );
}

main();
