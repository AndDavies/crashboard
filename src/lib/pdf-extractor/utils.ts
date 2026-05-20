import path from "node:path";
import type {
  ExtractionDiagnostic,
  PdfPageExtraction,
} from "@/lib/pdf-extractor/types";

const UNSAFE_FILENAME_CHARS = /[^a-z0-9._-]+/g;
const PDF_EXTENSION = /\.pdf$/iu;

export function safeFileSlug(name: string, fallback = "pdf-document") {
  const withoutExt = name
    .replace(PDF_EXTENSION, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "");

  const slug = withoutExt
    .toLowerCase()
    .replace(UNSAFE_FILENAME_CHARS, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 96);

  return slug || fallback;
}

export function safeMarkdownFilename(sourceName: string) {
  return `${safeFileSlug(sourceName)}.md`;
}

export function parsePageRange(pageRange: string | undefined, pageCount: number) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("PDF page count is unavailable.");
  }

  const trimmed = pageRange?.trim();
  if (!trimmed) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>();
  for (const part of trimmed.split(",")) {
    const token = part.trim();
    if (!token) continue;

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/u);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start > end) {
        throw new Error(`Invalid page range "${token}".`);
      }
      for (let page = start; page <= end; page += 1) pages.add(page);
      continue;
    }

    if (!/^\d+$/u.test(token)) {
      throw new Error(`Invalid page range token "${token}".`);
    }
    pages.add(Number(token));
  }

  const sorted = [...pages].sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new Error("Page range did not include any pages.");
  }

  const invalid = sorted.find((page) => page < 1 || page > pageCount);
  if (invalid) {
    throw new Error(`Page ${invalid} is outside the PDF's ${pageCount} pages.`);
  }

  return sorted;
}

export function groupConsecutivePages(pages: number[]) {
  const groups: Array<{ start: number; end: number }> = [];
  for (const page of [...pages].sort((a, b) => a - b)) {
    const last = groups.at(-1);
    if (last && page === last.end + 1) {
      last.end = page;
    } else {
      groups.push({ start: page, end: page });
    }
  }
  return groups;
}

export function normalizePdfText(text: string) {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(/[\u0000-\u0008\u000B\u000E-\u001F]/gu, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/gu, ""))
    .join("\n")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trim();
}

export function ensureWithinDirectory(childPath: string, parentDir: string) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  if (child === parent || child.startsWith(`${parent}${path.sep}`)) {
    return child;
  }
  throw new Error(`Refusing to write outside ${parent}.`);
}

export function toPosixPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

export function relativeMarkdownPath(fromDir: string, toPath: string) {
  const relative = path.relative(fromDir, toPath) || ".";
  return toPosixPath(relative);
}

export function diagnostic(
  level: ExtractionDiagnostic["level"],
  code: string,
  message: string,
  extra: Omit<ExtractionDiagnostic, "level" | "code" | "message"> = {},
): ExtractionDiagnostic {
  return { level, code, message, ...extra };
}

export function selectPagesForAi(
  pages: PdfPageExtraction[],
  maxPages: number,
) {
  return pages
    .filter((page) => page.renderedImage && (page.lowText || page.imageAssetCount > 0))
    .slice(0, Math.max(0, maxPages));
}

export function isExtractionResult(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Record<string, unknown>;
  return (
    typeof maybe.runId === "string" &&
    typeof maybe.markdown === "string" &&
    typeof maybe.plainText === "string" &&
    typeof maybe.suggestedMarkdownFilename === "string" &&
    Array.isArray(maybe.pages) &&
    Array.isArray(maybe.visualAssets) &&
    maybe.metadata != null &&
    typeof maybe.metadata === "object"
  );
}
