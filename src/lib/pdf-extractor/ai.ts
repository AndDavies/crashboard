import { promises as fs } from "node:fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  ExtractionDiagnostic,
  PdfPageExtraction,
  PdfPageVisualDescription,
} from "@/lib/pdf-extractor/types";

const PageVisualDescriptionSchema = z.object({
  pageNumber: z.number().int().positive(),
  summary: z.string().min(1),
  transcribedText: z.string().optional(),
  notableVisuals: z.array(z.string()).default([]),
  extractionNotes: z.array(z.string()).default([]),
});

function buildVisualPrompt(page: PdfPageExtraction) {
  const textState = page.text
    ? `The deterministic text extractor found ${page.textLength} characters. Use it as context, but correct obvious OCR or layout gaps only when visible in the page image.`
    : "The deterministic text extractor found no readable text. Focus on transcription, chart/table capture, headings, labels, and visible document structure.";

  return [
    `Describe PDF page ${page.pageNumber} for a Markdown knowledge-base companion file.`,
    textState,
    "Return concise, source-faithful output. Do not infer facts that are not visible. Preserve tables, headings, charts, diagrams, and figure meaning when visible.",
  ].join("\n\n");
}

export async function describeSelectedPageImages(options: {
  pages: PdfPageExtraction[];
  apiKey: string;
  model: string;
}): Promise<{
  descriptions: Map<number, PdfPageVisualDescription>;
  diagnostics: ExtractionDiagnostic[];
}> {
  const client = new OpenAI({ apiKey: options.apiKey });
  const descriptions = new Map<number, PdfPageVisualDescription>();
  const diagnostics: ExtractionDiagnostic[] = [];
  const failures: Array<{ pageNumber: number; detail: string }> = [];

  for (const page of options.pages) {
    if (!page.renderedImage) continue;
    try {
      const image = await fs.readFile(page.renderedImage.absolutePath);
      const response = await client.responses.parse({
        model: options.model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: buildVisualPrompt(page) },
              {
                type: "input_image",
                image_url: `data:image/png;base64,${image.toString("base64")}`,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(
            PageVisualDescriptionSchema,
            "pdf_page_visual_description",
          ),
        },
      });

      if (response.output_parsed) {
        descriptions.set(page.pageNumber, response.output_parsed);
      } else {
        diagnostics.push({
          level: "warning",
          code: "ai_visual_description_empty",
          message: "OpenAI returned no parsed visual description.",
          pageNumber: page.pageNumber,
        });
      }
    } catch (error) {
      failures.push({
        pageNumber: page.pageNumber,
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (failures.length > 0) {
    diagnostics.push({
      level: "warning",
      code: "ai_visual_description_failed",
      message: `OpenAI visual descriptions failed for ${failures.length} selected page${failures.length === 1 ? "" : "s"}.`,
      detail: failures
        .map((failure) => `Page ${failure.pageNumber}: ${failure.detail}`)
        .join("\n"),
    });
  }

  return { descriptions, diagnostics };
}
