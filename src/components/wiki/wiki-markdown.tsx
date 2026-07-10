import Link from "next/link";
import { WikiTableChart } from "@/components/wiki/wiki-table-chart";
import { stripWikiOwnedMarkdownSections } from "@/lib/public-wiki/markdown";
import type { PublicWikiChart } from "@/lib/public-wiki/types";

type Block =
  | { type: "heading"; level: number; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; rows: string[][] };

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseTableRow(line: string) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      const lang = fence[1] ?? "";
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", lang, code: code.join("\n") });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const text = heading[2].replace(/#+$/, "").trim();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text,
        id: slugify(text),
      });
      i += 1;
      continue;
    }

    if (line.trim().startsWith("|") && lines[i + 1]?.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered ? /^\s*\d+\.\s+/.test(lines[i]) : /^\s*[-*]\s+/.test(lines[i]))
      ) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim());
        i += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith("|") &&
      !lines[i].trim().startsWith(">")
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(\[[^\]]+]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {tokens.map((token, index) => {
        const link = token.match(/^\[([^\]]+)]\(([^)]+)\)$/);
        if (link) {
          const href = link[2];
          const internal = /^\/(?:wiki|blog|about)(?:\/|$)/.test(href);
          if (internal) {
            return (
              <Link key={`${token}-${index}`} href={href}>
                {link[1]}
              </Link>
            );
          }
          if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
            return <span key={`${token}-${index}`}>{link[1]}</span>;
          }
          return (
            <a key={`${token}-${index}`} href={href} rel="noopener noreferrer" target="_blank">
              {link[1]}
            </a>
          );
        }
        if (token.startsWith("`") && token.endsWith("`")) {
          return (
            <code key={`${token}-${index}`} className="border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[0.86em] text-foreground">
              {token.slice(1, -1)}
            </code>
          );
        }
        if (token.startsWith("**") && token.endsWith("**")) {
          return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>;
        }
        return <span key={`${token}-${index}`}>{token}</span>;
      })}
    </>
  );
}

function Table({ rows }: { rows: string[][] }) {
  const [head, separator, ...body] = rows;
  const dataRows = separator?.every((cell) => /^:?-{3,}:?$/.test(cell)) ? body : rows.slice(1);
  return (
    <div className="my-8 border border-border/80 bg-card/70">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border/80 text-sm">
            <thead className="bg-muted/50">
            <tr>
              {(head ?? []).map((cell) => (
                <th key={cell} className="eyebrow px-4 py-3 text-left">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/80">
            {dataRows.map((row, rowIndex) => (
              <tr
                key={`${row.join("-")}-${rowIndex}`}
                className="motion-safe:transition-colors hover:bg-muted/30"
              >
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${cell}-${cellIndex}`}
                    className="px-4 py-3 align-top text-muted-foreground first:font-medium first:text-foreground"
                  >
                    <InlineMarkdown text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const steps = code
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(1, 9)
    .map((line) => line.replace(/["[\]]/g, "").replace(/-->/g, "→"));

  return (
    <figure className="my-8 border border-border/80 bg-card/70">
      <figcaption className="flex flex-col gap-1 border-b border-border/80 px-5 py-4">
        <span className="eyebrow">Workflow diagram</span>
        <span className="font-heading text-base font-semibold text-foreground">
          Steps inferred from diagram markup
        </span>
      </figcaption>
      <ol className="grid gap-px bg-border/80 sm:grid-cols-2">
        {steps.map((line, index) => (
          <li
            key={`${line}-${index}`}
            className="flex items-start gap-3 bg-card/70 px-4 py-3 text-xs text-muted-foreground"
          >
            <span className="ordinal">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-foreground">{line}</span>
          </li>
        ))}
      </ol>
      <details className="border-t border-border/80 px-5 py-3">
        <summary className="meta-tag cursor-pointer hover:text-foreground">
          View source diagram
        </summary>
        <pre className="mt-3 overflow-x-auto bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          {code}
        </pre>
      </details>
    </figure>
  );
}

export function WikiMarkdown({
  markdown,
  charts,
}: {
  markdown: string;
  charts: PublicWikiChart[];
}) {
  const blocks = parseMarkdown(stripWikiOwnedMarkdownSections(markdown));

  return (
    <div className="wiki-prose">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 1) return null;
          const Tag = block.level === 2 ? "h2" : block.level === 3 ? "h3" : "h4";
          return (
            <Tag key={`${block.id}-${index}`} id={block.id} className="scroll-mt-24">
              {block.text}
            </Tag>
          );
        }
        if (block.type === "paragraph") {
          return (
            <p key={`${block.text}-${index}`}>
              <InlineMarkdown text={block.text} />
            </p>
          );
        }
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List key={`${block.items.join("-")}-${index}`}>
              {block.items.map((item) => (
                <li key={item}>
                  <InlineMarkdown text={item} />
                </li>
              ))}
            </List>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={`${block.text}-${index}`}>
              <InlineMarkdown text={block.text.replace(/^\[![^\]]+]\s*/, "")} />
            </blockquote>
          );
        }
        if (block.type === "code") {
          if (block.lang === "mermaid") return <MermaidBlock key={`${block.code}-${index}`} code={block.code} />;
          return (
            <pre key={`${block.code}-${index}`}>
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.type === "table") {
          return <Table key={`${index}-${block.rows.length}`} rows={block.rows} />;
        }
        return null;
      })}

      {charts.length > 0 ? (
        <section className="mt-12 border-t border-border/80 pt-8">
          <h2 id="generated-data-views" className="scroll-mt-24">
            Generated Data Views
          </h2>
          {charts.map((chart) => (
            <WikiTableChart key={chart.id} chart={chart} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
