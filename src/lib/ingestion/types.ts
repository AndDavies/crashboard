export type FetchedResource = {
  originalUrl: string;
  finalUrl: string;
  contentType: string;
  byteLength: number;
  buffer: ArrayBuffer;
  textBody?: string;
};

export type HtmlExtractionResult = {
  canonicalUrl: string | null;
  title: string | null;
  publisherName: string | null;
  language: string | null;
  rawText: string;
  normalizedText: string;
};

export type PdfExtractionResult = {
  checksumHex: string;
  byteSize: number;
  mimeType: string;
  normalizedText: string | null;
  extractionDeferred: boolean;
  deferReason?: string;
};

