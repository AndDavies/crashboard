const UI_OWNED_ENDING_TITLES = new Set([
  "related",
  "related pages",
  "source notes",
  "source note",
  "sources",
  "source trail",
  "references",
]);

export function normalizeMarkdownHeadingTitle(input: string) {
  return input
    .replace(/#+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function stripWikiOwnedMarkdownSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const kept: string[] = [];
  let skippedHeadingLevel: number | null = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const title = normalizeMarkdownHeadingTitle(heading[2]);

      if (skippedHeadingLevel !== null && level <= skippedHeadingLevel) {
        skippedHeadingLevel = null;
      }

      if (level === 2 && UI_OWNED_ENDING_TITLES.has(title)) {
        skippedHeadingLevel = level;
        continue;
      }
    }

    if (skippedHeadingLevel === null) kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}$/g, "\n\n").trimEnd();
}
