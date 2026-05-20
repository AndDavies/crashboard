export type PdfSourceType = "upload" | "url" | "path";

export type PdfOutputMode = "markdown" | "text";

export type PdfVisualMode = "full-assets";

export type PdfAiMode = "selective" | "off";

export type ExtractionStatus = "succeeded" | "partial" | "failed";

export type DiagnosticLevel = "info" | "warning" | "error";

export type ExtractionDiagnostic = {
  level: DiagnosticLevel;
  code: string;
  message: string;
  pageNumber?: number;
  detail?: string;
};

export type PdfVisualAsset = {
  kind: "page-render" | "embedded-image";
  pageNumber?: number;
  fileName: string;
  absolutePath: string;
  relativePath: string;
  byteSize: number;
  description?: string;
};

export type PdfPageVisualDescription = {
  pageNumber: number;
  summary: string;
  transcribedText?: string;
  notableVisuals: string[];
  extractionNotes: string[];
};

export type PdfPageExtraction = {
  pageNumber: number;
  text: string;
  textLength: number;
  extractionMethod: string;
  lowText: boolean;
  imageAssetCount: number;
  renderedImage?: PdfVisualAsset;
  aiDescription?: PdfPageVisualDescription;
};

export type PdfMetadata = {
  sourceType: PdfSourceType;
  sourceName: string;
  sourcePath?: string;
  sourceUrl?: string;
  byteSize: number;
  checksumHex: string;
  pageCount: number;
  selectedPages: number[];
  title?: string;
  encrypted?: boolean;
  assetSlug: string;
  extractedAt: string;
  extractionMethods: string[];
};

export type PdfExtractionResult = {
  status: ExtractionStatus;
  runId: string;
  metadata: PdfMetadata;
  pages: PdfPageExtraction[];
  markdown: string;
  plainText: string;
  visualAssets: PdfVisualAsset[];
  diagnostics: ExtractionDiagnostic[];
  saveEligibility: boolean;
  tempAssetDir?: string;
  suggestedMarkdownFilename: string;
  suggestedAssetDirName: string;
};

export type PdfExtractorSource =
  | {
      type: "path";
      path: string;
      sourceName?: string;
    }
  | {
      type: "upload";
      buffer: Buffer;
      sourceName: string;
    }
  | {
      type: "url";
      url: string;
      sourceName?: string;
    };

export type ExtractPdfOptions = {
  source: PdfExtractorSource;
  password?: string;
  pageRange?: string;
  outputMode?: PdfOutputMode;
  visualMode?: PdfVisualMode;
  aiMode?: PdfAiMode;
  workDir?: string;
  markdownOutputDir?: string;
  assetOutputDir?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  maxAiPages?: number;
};

export type SavedPdfExtraction = {
  markdownPath: string;
  assetDir: string;
  assetCount: number;
};
