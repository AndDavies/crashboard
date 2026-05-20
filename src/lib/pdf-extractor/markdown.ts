import path from "node:path";
import type {
  ExtractionDiagnostic,
  PdfExtractionResult,
  PdfPageExtraction,
  PdfVisualAsset,
} from "@/lib/pdf-extractor/types";
import { relativeMarkdownPath } from "@/lib/pdf-extractor/utils";

function yamlString(value: string) {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
}

function yamlStringList(values: string[]) {
  if (values.length === 0) return "[]";
  return `[${values.map(yamlString).join(", ")}]`;
}

function renderDiagnosticsForFrontmatter(diagnostics: ExtractionDiagnostic[]) {
  if (diagnostics.length === 0) return ["diagnostics: []"];
  return [
    "diagnostics:",
    ...diagnostics.map(
      (item) =>
        `  - level: ${yamlString(item.level)}\n    code: ${yamlString(item.code)}\n    message: ${yamlString(item.message)}`,
    ),
  ];
}

function renderImageReference(
  asset: PdfVisualAsset | undefined,
  markdownOutputDir: string | undefined,
) {
  if (!asset) return "";
  const href = markdownOutputDir
    ? relativeMarkdownPath(markdownOutputDir, asset.absolutePath)
    : asset.relativePath;
  return `![Page ${asset.pageNumber ?? ""}](${href})`;
}

function renderPage(page: PdfPageExtraction, markdownOutputDir?: string) {
  const lines = [
    `## Page ${page.pageNumber}`,
    "",
    `_Method: ${page.extractionMethod}; characters: ${page.textLength}; visual assets: ${page.imageAssetCount}_`,
    "",
  ];

  const image = renderImageReference(page.renderedImage, markdownOutputDir);
  if (image) {
    lines.push(image, "");
  }

  if (page.text) {
    lines.push(page.text, "");
  } else {
    lines.push("[No extractable text found on this page]", "");
  }

  if (page.aiDescription) {
    lines.push("### Visual Description", "", page.aiDescription.summary, "");
    if (page.aiDescription.notableVisuals.length > 0) {
      lines.push(
        ...page.aiDescription.notableVisuals.map((visual) => `- ${visual}`),
        "",
      );
    }
    if (page.aiDescription.transcribedText) {
      lines.push("### Visual Text", "", page.aiDescription.transcribedText, "");
    }
  }

  return lines.join("\n").trimEnd();
}

export function renderPlainText(result: Pick<PdfExtractionResult, "pages">) {
  return result.pages
    .map((page) => {
      const visual = page.aiDescription?.summary
        ? `\n\n[Visual description]\n${page.aiDescription.summary}`
        : "";
      return `Page ${page.pageNumber}\n\n${page.text || "[No extractable text found]"}${visual}`;
    })
    .join("\n\n---\n\n")
    .trim();
}

export function renderExtractionMarkdown(
  result: Pick<
    PdfExtractionResult,
    "metadata" | "pages" | "visualAssets" | "diagnostics"
  >,
  options: { markdownOutputDir?: string; assetDir?: string } = {},
) {
  const { metadata, pages, visualAssets, diagnostics } = result;
  const title = metadata.title || metadata.sourceName.replace(/\.pdf$/iu, "");
  const assetDirValue =
    options.markdownOutputDir && options.assetDir
      ? relativeMarkdownPath(options.markdownOutputDir, options.assetDir)
      : metadata.assetSlug;
  const aiPages = pages
    .filter((page) => page.aiDescription)
    .map((page) => String(page.pageNumber));
  const diagnosticsLines = renderDiagnosticsForFrontmatter(diagnostics);

  const frontmatter = [
    "---",
    `title: ${yamlString(title)}`,
    `source_file: ${yamlString(metadata.sourceName)}`,
    `source_type: ${yamlString(metadata.sourceType)}`,
    metadata.sourceUrl ? `source_url: ${yamlString(metadata.sourceUrl)}` : null,
    metadata.sourcePath ? `source_path: ${yamlString(metadata.sourcePath)}` : null,
    `byte_size: ${metadata.byteSize}`,
    `checksum_sha256: ${yamlString(metadata.checksumHex)}`,
    `page_count: ${metadata.pageCount}`,
    `selected_pages: ${yamlStringList(metadata.selectedPages.map(String))}`,
    `extracted_at: ${yamlString(metadata.extractedAt)}`,
    `extraction_methods: ${yamlStringList(metadata.extractionMethods)}`,
    `asset_dir: ${yamlString(assetDirValue)}`,
    `ai_described_pages: ${yamlStringList(aiPages)}`,
    ...diagnosticsLines,
    "---",
  ].filter((line): line is string => Boolean(line));

  const visualLines =
    visualAssets.length > 0
      ? [
          "## Visual Assets",
          "",
          ...visualAssets.map((asset) => {
            const href = options.markdownOutputDir
              ? relativeMarkdownPath(options.markdownOutputDir, asset.absolutePath)
              : asset.relativePath;
            const page = asset.pageNumber ? `page ${asset.pageNumber}` : "document";
            return `- ${asset.kind} (${page}): [${path.basename(asset.fileName)}](${href})`;
          }),
          "",
        ]
      : [];

  const notes = [
    "## Extraction Notes",
    "",
    `- Source: \`${metadata.sourceName}\``,
    `- Pages: ${metadata.pageCount}`,
    `- Selected pages: ${metadata.selectedPages.join(", ")}`,
    `- Extraction methods: ${metadata.extractionMethods.join(", ") || "none"}`,
    `- Visual assets: ${visualAssets.length}`,
    `- AI-described pages: ${aiPages.length ? aiPages.join(", ") : "none"}`,
    "",
  ];

  const pageBlocks = pages.map((page) =>
    renderPage(page, options.markdownOutputDir),
  );

  return [
    frontmatter.join("\n"),
    "",
    `# ${title}`,
    "",
    notes.join("\n"),
    ...visualLines,
    ...pageBlocks,
    "",
  ]
    .join("\n")
    .replace(/\n{4,}/gu, "\n\n\n")
    .trimEnd()
    .concat("\n");
}
