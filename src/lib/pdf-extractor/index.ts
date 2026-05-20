export { extractPdf } from "@/lib/pdf-extractor/extractor";
export { saveExtractionCompanion } from "@/lib/pdf-extractor/save";
export {
  DEFAULT_ASSET_OUTPUT_DIR,
  DEFAULT_MARKDOWN_OUTPUT_DIR,
  DEFAULT_RAW_INPUT_DIR,
  DEFAULT_VAULT_ROOT,
} from "@/lib/pdf-extractor/constants";
export type {
  ExtractPdfOptions,
  ExtractionDiagnostic,
  PdfExtractionResult,
  PdfOutputMode,
  SavedPdfExtraction,
} from "@/lib/pdf-extractor/types";
