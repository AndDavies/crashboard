import { describe, expect, it } from "vitest";
import { classifyPdfToolError, runTool } from "@/lib/pdf-extractor/tools";
import { renderExtractionMarkdown } from "@/lib/pdf-extractor/markdown";
import type { PdfExtractionResult } from "@/lib/pdf-extractor/types";
import {
  ensureWithinDirectory,
  parsePageRange,
  safeFileSlug,
  selectPagesForAi,
} from "@/lib/pdf-extractor/utils";

describe("pdf extractor utilities", () => {
  it("parses page ranges into sorted unique pages", () => {
    expect(parsePageRange("1-3, 3, 5", 8)).toEqual([1, 2, 3, 5]);
    expect(parsePageRange(undefined, 3)).toEqual([1, 2, 3]);
    expect(() => parsePageRange("5-2", 8)).toThrow("Invalid page range");
    expect(() => parsePageRange("9", 8)).toThrow("outside");
  });

  it("creates safe output slugs", () => {
    expect(safeFileSlug("McKinsey Quarterly Q2 2026 (Encrypted).pdf")).toBe(
      "mckinsey-quarterly-q2-2026-encrypted",
    );
    expect(safeFileSlug("😀.pdf")).toBe("pdf-document");
  });

  it("guards save paths to the configured vault root", () => {
    expect(ensureWithinDirectory("/tmp/root/outputs/file.md", "/tmp/root")).toBe(
      "/tmp/root/outputs/file.md",
    );
    expect(() => ensureWithinDirectory("/tmp/elsewhere/file.md", "/tmp/root")).toThrow(
      "Refusing to write",
    );
  });

  it("classifies password and encryption failures", () => {
    expect(classifyPdfToolError("Command Line Error: Incorrect password").code).toBe(
      "password_invalid",
    );
    expect(classifyPdfToolError("Document is encrypted").code).toBe(
      "password_required",
    );
  });

  it("does not echo command arguments in tool failure details", async () => {
    const secret = "secret-pdf-password";
    await expect(
      runTool(process.execPath, [
        "-e",
        "process.stderr.write('tool stderr'); process.exit(2)",
        secret,
      ]),
    ).rejects.toThrow("tool stderr");
    await expect(
      runTool(process.execPath, [
        "-e",
        "process.exit(2)",
        secret,
      ]),
    ).rejects.not.toThrow(secret);
  });

  it("selects low-text and image-heavy pages for selective AI", () => {
    const pages = [
      {
        pageNumber: 1,
        text: "Long enough ".repeat(30),
        textLength: 360,
        extractionMethod: "pdftotext",
        lowText: false,
        imageAssetCount: 0,
        renderedImage: {
          kind: "page-render" as const,
          pageNumber: 1,
          fileName: "page-001.png",
          absolutePath: "/tmp/page-001.png",
          relativePath: "page-001.png",
          byteSize: 1,
        },
      },
      {
        pageNumber: 2,
        text: "",
        textLength: 0,
        extractionMethod: "pdftotext",
        lowText: true,
        imageAssetCount: 0,
        renderedImage: {
          kind: "page-render" as const,
          pageNumber: 2,
          fileName: "page-002.png",
          absolutePath: "/tmp/page-002.png",
          relativePath: "page-002.png",
          byteSize: 1,
        },
      },
      {
        pageNumber: 3,
        text: "Text",
        textLength: 4,
        extractionMethod: "pdftotext",
        lowText: false,
        imageAssetCount: 2,
      },
    ];

    expect(selectPagesForAi(pages, 5).map((page) => page.pageNumber)).toEqual([
      2,
    ]);
  });

  it("renders markdown with metadata, diagnostics, and page content", () => {
    const result = {
      metadata: {
        sourceType: "path",
        sourceName: "example.pdf",
        sourcePath: "/tmp/example.pdf",
        byteSize: 100,
        checksumHex: "abc",
        pageCount: 1,
        selectedPages: [1],
        assetSlug: "example",
        extractedAt: "2026-05-19T00:00:00.000Z",
        extractionMethods: ["pdftotext", "pdftoppm"],
      },
      pages: [
        {
          pageNumber: 1,
          text: "Readable text",
          textLength: 13,
          extractionMethod: "pdftotext",
          lowText: false,
          imageAssetCount: 0,
        },
      ],
      visualAssets: [],
      diagnostics: [
        {
          level: "warning",
          code: "sample_warning",
          message: "A warning",
        },
      ],
    } satisfies Pick<
      PdfExtractionResult,
      "metadata" | "pages" | "visualAssets" | "diagnostics"
    >;

    const markdown = renderExtractionMarkdown(result);
    expect(markdown).toContain('source_file: "example.pdf"');
    expect(markdown).toContain("sample_warning");
    expect(markdown).toContain("## Page 1");
    expect(markdown).toContain("Readable text");
  });
});
