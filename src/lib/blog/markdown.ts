const BLOCK_START_RE =
  /^(#{1,6}\s+|```|~~~|\s*(?:[-*+]|\d+\.)\s+|>\s?|[-*_]{3,}\s*$)/;

export function looksLikeMarkdownContent(input: string) {
  const text = input.trim();
  if (!text) return false;

  return (
    /^#{1,6}\s+\S/m.test(text) ||
    /^```/m.test(text) ||
    /^~~~/m.test(text) ||
    /^\s*(?:[-*+]|\d+\.)\s+\S/m.test(text) ||
    /^>\s?\S/m.test(text) ||
    /^\s*[-*_]{3,}\s*$/m.test(text) ||
    /!\[[^\]]*]\([^)]+\)/.test(text) ||
    /\[[^\]]+]\([^)]+\)/.test(text) ||
    /(?:\*\*|__)[\s\S]+?(?:\*\*|__)/.test(text)
  );
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

function safeLinkUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^mailto:/i.test(trimmed)) return trimmed;
  return null;
}

function safeImageUrl(url: string) {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function parseInlineMarkdown(text: string): string {
  const tokens = text.split(
    /(!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g,
  );

  return tokens
    .map((token) => {
      if (!token) return "";

      const image = token.match(/^!\[([^\]]*)]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
      if (image) {
        const src = safeImageUrl(image[2]);
        if (!src) return escapeHtml(token);
        return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(image[1])}">`;
      }

      const link = token.match(/^\[([^\]]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
      if (link) {
        const href = safeLinkUrl(link[2]);
        if (!href) return escapeHtml(link[1]);
        const external = /^https?:\/\//i.test(href);
        const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return `<a href="${escapeAttribute(href)}"${attrs}>${parseInlineMarkdown(link[1])}</a>`;
      }

      if (token.startsWith("`") && token.endsWith("`")) {
        return `<code>${escapeHtml(token.slice(1, -1))}</code>`;
      }

      if (
        (token.startsWith("**") && token.endsWith("**")) ||
        (token.startsWith("__") && token.endsWith("__"))
      ) {
        return `<strong>${parseInlineMarkdown(token.slice(2, -2))}</strong>`;
      }

      if (
        (token.startsWith("*") && token.endsWith("*")) ||
        (token.startsWith("_") && token.endsWith("_"))
      ) {
        return `<em>${parseInlineMarkdown(token.slice(1, -1))}</em>`;
      }

      return escapeHtml(token);
    })
    .join("");
}

function isBlockStart(line: string) {
  return BLOCK_START_RE.test(line);
}

function listItemText(line: string) {
  return line.replace(/^\s*(?:[-*+]|\d+\.)\s+/, "").trim();
}

function renderParagraph(lines: string[]) {
  return `<p>${parseInlineMarkdown(lines.map((line) => line.trim()).join(" "))}</p>`;
}

export function markdownToBlogHtml(markdown: string) {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const fence = trimmed.match(/^(```|~~~)(\w+)?/);
    if (fence) {
      const marker = fence[1];
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const text = heading[2].replace(/\s+#+$/, "").trim();
      blocks.push(`<h${level}>${parseInlineMarkdown(text)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push("<hr>");
      i += 1;
      continue;
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+\S/.test(line)) {
      const ordered = /^\s*\d+\.\s+\S/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        (ordered
          ? /^\s*\d+\.\s+\S/.test(lines[i])
          : /^\s*[-*+]\s+\S/.test(lines[i]))
      ) {
        items.push(`<li>${parseInlineMarkdown(listItemText(lines[i]))}</li>`);
        i += 1;
      }
      blocks.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(`<blockquote>${renderParagraph(quote)}</blockquote>`);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(renderParagraph(paragraph));
  }

  return blocks.join("\n");
}
