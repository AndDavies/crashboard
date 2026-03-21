import { sha256HexFromBuffer } from "@/lib/ingestion/hash";
import {
  normalizeTextForStorage,
  stripControlCharacters,
} from "@/lib/ingestion/normalize";
import type { PdfExtractionResult } from "@/lib/ingestion/types";

/**
 * Text extraction via `pdf-parse` (PDF.js under the hood). Kept in this module
 * so the rest of ingestion stays unaware of the PDF library’s API surface.
 */
export async function extractPdfPayload(
  buffer: ArrayBuffer,
  mimeType: string,
): Promise<PdfExtractionResult> {
  const checksumHex = sha256HexFromBuffer(buffer);
  const byteSize = buffer.byteLength;

  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const textResult = await parser.getText();
      const normalized = normalizeTextForStorage(
        stripControlCharacters(textResult.text ?? ""),
      );
      const normalizedText = normalized.length > 0 ? normalized : null;
      return {
        checksumHex,
        byteSize,
        mimeType: mimeType || "application/pdf",
        normalizedText,
        extractionDeferred: !normalizedText,
        deferReason: normalizedText ? undefined : "empty_text_from_pdf",
      };
    } finally {
      await parser.destroy();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "pdf_parse_error";
    return {
      checksumHex,
      byteSize,
      mimeType: mimeType || "application/pdf",
      normalizedText: null,
      extractionDeferred: true,
      deferReason: msg,
    };
  }
}
