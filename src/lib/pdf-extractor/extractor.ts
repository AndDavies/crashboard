import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  DEFAULT_MAX_AI_PAGES,
  DEFAULT_OPENAI_PDF_MODEL,
  DEFAULT_WORK_DIR,
  LOW_TEXT_CHARACTER_THRESHOLD,
  MAX_UPLOAD_BYTES,
} from "@/lib/pdf-extractor/constants";
import { describeSelectedPageImages } from "@/lib/pdf-extractor/ai";
import {
  renderExtractionMarkdown,
  renderPlainText,
} from "@/lib/pdf-extractor/markdown";
import {
  classifyPdfToolError,
  parsePdfInfoOutput,
  passwordArgs,
  runTool,
  toolAvailable,
} from "@/lib/pdf-extractor/tools";
import type {
  ExtractPdfOptions,
  ExtractionDiagnostic,
  PdfExtractionResult,
  PdfMetadata,
  PdfPageExtraction,
  PdfVisualAsset,
} from "@/lib/pdf-extractor/types";
import {
  diagnostic,
  groupConsecutivePages,
  normalizePdfText,
  parsePageRange,
  safeFileSlug,
  safeMarkdownFilename,
  selectPagesForAi,
} from "@/lib/pdf-extractor/utils";

type MaterializedSource = {
  filePath: string;
  sourceName: string;
  sourceType: PdfMetadata["sourceType"];
  sourceUrl?: string;
  sourcePath?: string;
  byteSize: number;
  checksumHex: string;
  buffer?: Buffer;
};

type TextExtraction = {
  pageTexts: Map<number, string>;
  method: string;
  diagnostics: ExtractionDiagnostic[];
};

type EmbeddedImageRow = {
  pageNumber: number;
  imageIndex: number;
};

function sha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readStreamBuffer(filePath: string) {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return Buffer.concat(chunks);
}

async function hashFile(filePath: string) {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function fileByteSize(filePath: string) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

function sourceNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const name = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).pop() || "downloaded.pdf",
    );
    return /\.pdf$/iu.test(name) ? name : `${name || "downloaded"}.pdf`;
  } catch {
    return "downloaded.pdf";
  }
}

async function fetchUrlBuffer(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/pdf,*/*;q=0.8",
        "user-agent": "Crashboard PDF Extractor",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (
      contentType &&
      !contentType.toLowerCase().includes("pdf") &&
      !url.toLowerCase().includes(".pdf")
    ) {
      throw new Error(`URL did not return a PDF content type: ${contentType}`);
    }
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

async function materializeSource(
  options: ExtractPdfOptions,
  runDir: string,
): Promise<{ source?: MaterializedSource; diagnostics: ExtractionDiagnostic[] }> {
  const diagnostics: ExtractionDiagnostic[] = [];
  const { source } = options;

  try {
    if (source.type === "path") {
      const filePath = path.resolve(source.path);
      const byteSize = await fileByteSize(filePath);
      return {
        source: {
          filePath,
          sourceName: source.sourceName || path.basename(filePath),
          sourceType: "path",
          sourcePath: filePath,
          byteSize,
          checksumHex: byteSize > 0 ? await hashFile(filePath) : sha256Hex(Buffer.alloc(0)),
        },
        diagnostics,
      };
    }

    if (source.type === "upload") {
      if (source.buffer.byteLength > MAX_UPLOAD_BYTES) {
        diagnostics.push(
          diagnostic(
            "error",
            "upload_too_large",
            "PDF upload exceeds the local extractor safety limit.",
          ),
        );
        return { diagnostics };
      }
      const fileName = /\.pdf$/iu.test(source.sourceName)
        ? source.sourceName
        : `${source.sourceName}.pdf`;
      const filePath = path.join(runDir, fileName);
      await fs.writeFile(filePath, source.buffer);
      return {
        source: {
          filePath,
          sourceName: fileName,
          sourceType: "upload",
          byteSize: source.buffer.byteLength,
          checksumHex: sha256Hex(source.buffer),
          buffer: source.buffer,
        },
        diagnostics,
      };
    }

    const buffer = await fetchUrlBuffer(source.url);
    const sourceName = source.sourceName || sourceNameFromUrl(source.url);
    const filePath = path.join(runDir, sourceName);
    await fs.writeFile(filePath, buffer);
    return {
      source: {
        filePath,
        sourceName,
        sourceType: "url",
        sourceUrl: source.url,
        byteSize: buffer.byteLength,
        checksumHex: sha256Hex(buffer),
        buffer,
      },
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        "source_materialization_failed",
        source.type === "url"
          ? "The PDF URL could not be fetched. Download it locally, then upload it or run the CLI against the file path."
          : "The PDF source could not be opened.",
        { detail: error instanceof Error ? error.message : "Unknown error" },
      ),
    );
    return { diagnostics };
  }
}

function emptyResult(args: {
  runId: string;
  sourceName: string;
  sourceType: PdfMetadata["sourceType"];
  sourcePath?: string;
  sourceUrl?: string;
  byteSize: number;
  checksumHex: string;
  diagnostics: ExtractionDiagnostic[];
}): PdfExtractionResult {
  const assetSlug = safeFileSlug(args.sourceName);
  const metadata: PdfMetadata = {
    sourceType: args.sourceType,
    sourceName: args.sourceName,
    sourcePath: args.sourcePath,
    sourceUrl: args.sourceUrl,
    byteSize: args.byteSize,
    checksumHex: args.checksumHex,
    pageCount: 0,
    selectedPages: [],
    assetSlug,
    extractedAt: new Date().toISOString(),
    extractionMethods: [],
  };

  return {
    status: "failed",
    runId: args.runId,
    metadata,
    pages: [],
    markdown: "",
    plainText: "",
    visualAssets: [],
    diagnostics: args.diagnostics,
    saveEligibility: false,
    suggestedMarkdownFilename: safeMarkdownFilename(args.sourceName),
    suggestedAssetDirName: assetSlug,
  };
}

async function readPdfInfo(
  filePath: string,
  password?: string,
): Promise<{ info?: ReturnType<typeof parsePdfInfoOutput>; diagnostics: ExtractionDiagnostic[] }> {
  if (!(await toolAvailable("pdfinfo"))) {
    return {
      diagnostics: [
        diagnostic(
          "warning",
          "pdfinfo_missing",
          "pdfinfo is not installed; PDF metadata and page counts may be limited.",
        ),
      ],
    };
  }

  try {
    const { stdout } = await runTool("pdfinfo", [
      ...passwordArgs(password),
      filePath,
    ]);
    const info = parsePdfInfoOutput(stdout);
    if (!info.pageCount) {
      return {
        diagnostics: [
          diagnostic(
            "error",
            "page_count_missing",
            "Could not determine the PDF page count.",
          ),
        ],
      };
    }
    return { info, diagnostics: [] };
  } catch (error) {
    return {
      diagnostics: [
        classifyPdfToolError(error instanceof Error ? error.message : "pdfinfo failed"),
      ],
    };
  }
}

async function extractTextWithPdftotext(
  filePath: string,
  pages: number[],
  password?: string,
): Promise<TextExtraction | null> {
  if (!(await toolAvailable("pdftotext"))) return null;

  const pageTexts = new Map<number, string>();
  const diagnostics: ExtractionDiagnostic[] = [];
  for (const group of groupConsecutivePages(pages)) {
    try {
      const { stdout } = await runTool(
        "pdftotext",
        [
          ...passwordArgs(password),
          "-enc",
          "UTF-8",
          "-f",
          String(group.start),
          "-l",
          String(group.end),
          filePath,
          "-",
        ],
        { maxBuffer: 96 * 1024 * 1024 },
      );
      const split = stdout.replace(/\f+$/u, "").split("\f");
      for (let page = group.start; page <= group.end; page += 1) {
        const text = split[page - group.start] ?? "";
        pageTexts.set(page, normalizePdfText(text));
      }
    } catch (error) {
      diagnostics.push(
        classifyPdfToolError(
          error instanceof Error ? error.message : "pdftotext failed",
        ),
      );
    }
  }

  return {
    pageTexts,
    method: "pdftotext",
    diagnostics,
  };
}

async function extractTextWithPdfParse(
  filePath: string,
  pages: number[],
  buffer?: Buffer,
): Promise<TextExtraction> {
  const diagnostics: ExtractionDiagnostic[] = [];
  const pageTexts = new Map<number, string>();

  try {
    const { PDFParse } = await import("pdf-parse");
    const pdfBuffer = buffer ?? (await readStreamBuffer(filePath));
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    try {
      const result = await parser.getText();
      const text = normalizePdfText(result.text ?? "");
      const split = text.includes("\f") ? text.split("\f") : [];
      for (const page of pages) {
        const pageText = split.length ? split[page - 1] ?? "" : page === pages[0] ? text : "";
        pageTexts.set(page, normalizePdfText(pageText));
      }
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "pdf_parse_failed", "pdf-parse fallback failed.", {
        detail: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }

  return { pageTexts, method: "pdf-parse", diagnostics };
}

async function renderPageImages(options: {
  filePath: string;
  pages: number[];
  assetDir: string;
  password?: string;
}): Promise<{ assets: PdfVisualAsset[]; diagnostics: ExtractionDiagnostic[] }> {
  const diagnostics: ExtractionDiagnostic[] = [];
  const assets: PdfVisualAsset[] = [];
  if (!(await toolAvailable("pdftoppm"))) {
    return {
      assets,
      diagnostics: [
        diagnostic(
          "warning",
          "pdftoppm_missing",
          "pdftoppm is not installed; page images were not rendered.",
        ),
      ],
    };
  }

  await fs.mkdir(options.assetDir, { recursive: true });
  for (const page of options.pages) {
    const prefix = path.join(options.assetDir, `page-${String(page).padStart(3, "0")}`);
    const target = `${prefix}.png`;
    try {
      const before = new Set(await fs.readdir(options.assetDir));
      await runTool("pdftoppm", [
        ...passwordArgs(options.password),
        "-png",
        "-r",
        "144",
        "-f",
        String(page),
        "-l",
        String(page),
        options.filePath,
        prefix,
      ]);
      const after = await fs.readdir(options.assetDir);
      const generated = after.find(
        (file) => !before.has(file) && file.startsWith(path.basename(prefix)),
      );
      if (!generated) {
        diagnostics.push(
          diagnostic(
            "warning",
            "page_render_missing",
            "pdftoppm completed but did not produce a page image.",
            { pageNumber: page },
          ),
        );
        continue;
      }
      const generatedPath = path.join(options.assetDir, generated);
      if (generatedPath !== target) {
        await fs.rename(generatedPath, target);
      }
      assets.push({
        kind: "page-render",
        pageNumber: page,
        fileName: path.basename(target),
        absolutePath: target,
        relativePath: path.basename(target),
        byteSize: await fileByteSize(target),
      });
    } catch (error) {
      const classified = classifyPdfToolError(
        error instanceof Error ? error.message : "pdftoppm failed",
      );
      diagnostics.push({
        ...classified,
        level: "warning",
        code:
          classified.code === "pdf_tool_failed"
            ? "page_render_failed"
            : classified.code,
        message:
          classified.code === "pdf_tool_failed"
            ? "A page image could not be rendered; text extraction may still be usable."
            : classified.message,
        pageNumber: page,
      });
    }
  }

  return { assets, diagnostics };
}

function parsePdfImagesList(output: string) {
  const rows: EmbeddedImageRow[] = [];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!/^\d+\s+\d+\s+/u.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/u);
    const pageNumber = Number(parts[0]);
    const imageIndex = Number(parts[1]);
    if (Number.isInteger(pageNumber) && Number.isInteger(imageIndex)) {
      rows.push({ pageNumber, imageIndex });
    }
  }
  return rows;
}

async function extractEmbeddedImages(options: {
  filePath: string;
  pages: number[];
  assetDir: string;
  password?: string;
}): Promise<{ assets: PdfVisualAsset[]; diagnostics: ExtractionDiagnostic[] }> {
  const diagnostics: ExtractionDiagnostic[] = [];
  const assets: PdfVisualAsset[] = [];
  if (!(await toolAvailable("pdfimages"))) {
    return {
      assets,
      diagnostics: [
        diagnostic(
          "warning",
          "pdfimages_missing",
          "pdfimages is not installed; embedded images were not extracted.",
        ),
      ],
    };
  }

  await fs.mkdir(options.assetDir, { recursive: true });
  for (const group of groupConsecutivePages(options.pages)) {
    try {
      const listResult = await runTool("pdfimages", [
        ...passwordArgs(options.password),
        "-f",
        String(group.start),
        "-l",
        String(group.end),
        "-list",
        options.filePath,
      ]);
      const rows = parsePdfImagesList(listResult.stdout);
      if (rows.length === 0) continue;

      const before = new Set(await fs.readdir(options.assetDir));
      const prefix = path.join(options.assetDir, `embedded-${group.start}-${group.end}`);
      await runTool("pdfimages", [
        ...passwordArgs(options.password),
        "-png",
        "-f",
        String(group.start),
        "-l",
        String(group.end),
        options.filePath,
        prefix,
      ]);

      const generated = (await fs.readdir(options.assetDir))
        .filter((file) => !before.has(file) && file.startsWith(path.basename(prefix)))
        .sort((a, b) => a.localeCompare(b));

      for (let index = 0; index < generated.length; index += 1) {
        const source = path.join(options.assetDir, generated[index]!);
        const row = rows[index];
        const pageNumber = row?.pageNumber;
        const ext = path.extname(source) || ".png";
        const targetName = `embedded-${String(pageNumber ?? group.start).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}${ext}`;
        const target = path.join(options.assetDir, targetName);
        if (source !== target) await fs.rename(source, target);
        assets.push({
          kind: "embedded-image",
          pageNumber,
          fileName: targetName,
          absolutePath: target,
          relativePath: targetName,
          byteSize: await fileByteSize(target),
        });
      }
    } catch (error) {
      const classified = classifyPdfToolError(
        error instanceof Error ? error.message : "pdfimages failed",
      );
      diagnostics.push(
        {
          ...classified,
          level: "warning",
          code:
            classified.code === "pdf_tool_failed"
              ? "embedded_images_failed"
              : classified.code,
          message:
            classified.code === "pdf_tool_failed"
              ? "Embedded image extraction failed; rendered page images and text extraction may still be usable."
              : classified.message,
        },
      );
    }
  }

  return { assets, diagnostics };
}

function buildPages(
  selectedPages: number[],
  textExtraction: TextExtraction,
  pageRenders: PdfVisualAsset[],
  embeddedImages: PdfVisualAsset[],
): PdfPageExtraction[] {
  return selectedPages.map((pageNumber) => {
    const text = textExtraction.pageTexts.get(pageNumber) ?? "";
    const imageAssetCount = embeddedImages.filter(
      (asset) => asset.pageNumber === pageNumber,
    ).length;
    return {
      pageNumber,
      text,
      textLength: text.length,
      extractionMethod: textExtraction.method,
      lowText: text.length < LOW_TEXT_CHARACTER_THRESHOLD,
      imageAssetCount,
      renderedImage: pageRenders.find((asset) => asset.pageNumber === pageNumber),
    } satisfies PdfPageExtraction;
  });
}

function deriveStatus(
  pages: PdfPageExtraction[],
  visualAssets: PdfVisualAsset[],
  diagnostics: ExtractionDiagnostic[],
) {
  const hasError = diagnostics.some((item) => item.level === "error");
  const hasText = pages.some((page) => page.text.trim().length > 0);
  if (pages.length === 0 || (hasError && !hasText && visualAssets.length === 0)) {
    return "failed" as const;
  }
  if (hasError || !hasText) return "partial" as const;
  return "succeeded" as const;
}

export async function extractPdf(
  options: ExtractPdfOptions,
): Promise<PdfExtractionResult> {
  const runId = randomUUID();
  const workDir = options.workDir ?? DEFAULT_WORK_DIR;
  const runDir = path.join(workDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  const materialized = await materializeSource(options, runDir);
  if (!materialized.source) {
    return emptyResult({
      runId,
      sourceName:
        options.source.type === "url"
          ? sourceNameFromUrl(options.source.url)
          : options.source.type === "path"
            ? path.basename(options.source.path)
            : options.source.sourceName,
      sourceType: options.source.type,
      byteSize: 0,
      checksumHex: "",
      diagnostics: materialized.diagnostics,
    });
  }

  const source = materialized.source;
  const diagnostics = [...materialized.diagnostics];
  const assetSlug = safeFileSlug(source.sourceName);
  const assetDir = options.assetOutputDir
    ? path.join(options.assetOutputDir, assetSlug)
    : path.join(runDir, "assets", assetSlug);

  if (source.byteSize === 0) {
    diagnostics.push(
      diagnostic(
        "error",
        "zero_byte_pdf",
        "The PDF is 0 bytes and must be reacquired before extraction or compile.",
      ),
    );
    return emptyResult({
      runId,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      sourcePath: source.sourcePath,
      sourceUrl: source.sourceUrl,
      byteSize: source.byteSize,
      checksumHex: source.checksumHex,
      diagnostics,
    });
  }

  const methods = new Set<string>();
  const infoResult = await readPdfInfo(source.filePath, options.password);
  diagnostics.push(...infoResult.diagnostics);
  if (!infoResult.info || !infoResult.info.pageCount) {
    return emptyResult({
      runId,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      sourcePath: source.sourcePath,
      sourceUrl: source.sourceUrl,
      byteSize: source.byteSize,
      checksumHex: source.checksumHex,
      diagnostics,
    });
  }
  methods.add("pdfinfo");

  let selectedPages: number[];
  try {
    selectedPages = parsePageRange(options.pageRange, infoResult.info.pageCount);
  } catch (error) {
    diagnostics.push(
      diagnostic("error", "invalid_page_range", "The page range is invalid.", {
        detail: error instanceof Error ? error.message : "Unknown error",
      }),
    );
    return emptyResult({
      runId,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      sourcePath: source.sourcePath,
      sourceUrl: source.sourceUrl,
      byteSize: source.byteSize,
      checksumHex: source.checksumHex,
      diagnostics,
    });
  }

  const rendered = await renderPageImages({
    filePath: source.filePath,
    pages: selectedPages,
    assetDir,
    password: options.password,
  });
  diagnostics.push(...rendered.diagnostics);
  if (rendered.assets.length > 0) methods.add("pdftoppm");

  const embedded = await extractEmbeddedImages({
    filePath: source.filePath,
    pages: selectedPages,
    assetDir,
    password: options.password,
  });
  diagnostics.push(...embedded.diagnostics);
  if (embedded.assets.length > 0) methods.add("pdfimages");

  let textExtraction = await extractTextWithPdftotext(
    source.filePath,
    selectedPages,
    options.password,
  );
  if (!textExtraction) {
    diagnostics.push(
      diagnostic(
        "warning",
        "pdftotext_missing",
        "pdftotext is not installed; falling back to pdf-parse.",
      ),
    );
    textExtraction = await extractTextWithPdfParse(
      source.filePath,
      selectedPages,
      source.buffer,
    );
  } else if (
    textExtraction.diagnostics.some((item) => item.level === "error") ||
    [...textExtraction.pageTexts.values()].every((text) => !text.trim())
  ) {
    diagnostics.push(...textExtraction.diagnostics);
    const fallback = await extractTextWithPdfParse(
      source.filePath,
      selectedPages,
      source.buffer,
    );
    if ([...fallback.pageTexts.values()].some((text) => text.trim())) {
      textExtraction = fallback;
    }
  }
  diagnostics.push(...textExtraction.diagnostics.filter((item) => item.level !== "error"));
  methods.add(textExtraction.method);

  const visualAssets = [...rendered.assets, ...embedded.assets];
  const pages = buildPages(
    selectedPages,
    textExtraction,
    rendered.assets,
    embedded.assets,
  );

  const aiMode = options.aiMode ?? "selective";
  const aiCandidates = selectPagesForAi(
    pages,
    options.maxAiPages ?? DEFAULT_MAX_AI_PAGES,
  );
  if (aiMode === "selective" && aiCandidates.length > 0) {
    const apiKey = options.openaiApiKey?.trim();
    if (!apiKey) {
      diagnostics.push(
        diagnostic(
          "warning",
          "openai_api_key_missing",
          "OPENAI_API_KEY is not configured; visual AI descriptions were skipped.",
        ),
      );
    } else {
      const described = await describeSelectedPageImages({
        pages: aiCandidates,
        apiKey,
        model: options.openaiModel ?? DEFAULT_OPENAI_PDF_MODEL,
      });
      diagnostics.push(...described.diagnostics);
      if (described.descriptions.size > 0) methods.add("openai_vision");
      for (const page of pages) {
        page.aiDescription = described.descriptions.get(page.pageNumber);
      }
      for (const asset of visualAssets) {
        if (asset.kind === "page-render" && asset.pageNumber) {
          asset.description = described.descriptions.get(asset.pageNumber)?.summary;
        }
      }
    }
  }

  const metadata: PdfMetadata = {
    sourceType: source.sourceType,
    sourceName: source.sourceName,
    sourcePath: source.sourcePath,
    sourceUrl: source.sourceUrl,
    byteSize: source.byteSize,
    checksumHex: source.checksumHex,
    pageCount: infoResult.info.pageCount,
    selectedPages,
    title: infoResult.info.title,
    encrypted: infoResult.info.encrypted,
    assetSlug,
    extractedAt: new Date().toISOString(),
    extractionMethods: [...methods],
  };

  const partialResult = {
    metadata,
    pages,
    visualAssets,
    diagnostics,
  };
  const markdown = renderExtractionMarkdown(partialResult, {
    markdownOutputDir: options.markdownOutputDir,
    assetDir,
  });
  const plainText = renderPlainText({ pages });
  const status = deriveStatus(pages, visualAssets, diagnostics);

  return {
    status,
    runId,
    metadata,
    pages,
    markdown,
    plainText,
    visualAssets,
    diagnostics,
    saveEligibility: status !== "failed" && markdown.trim().length > 0,
    tempAssetDir: assetDir,
    suggestedMarkdownFilename: safeMarkdownFilename(source.sourceName),
    suggestedAssetDirName: assetSlug,
  };
}
