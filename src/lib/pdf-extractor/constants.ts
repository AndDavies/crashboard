import path from "node:path";
import os from "node:os";

export const DEFAULT_VAULT_ROOT = path.join(
  "/Users/andrewdavies/Library/Mobile Documents/iCloud~md~obsidian/Documents/Andrew's Vault",
  "Knowledge Base",
);

export const DEFAULT_RAW_INPUT_DIR = path.join(DEFAULT_VAULT_ROOT, "raw");

export const DEFAULT_MARKDOWN_OUTPUT_DIR = path.join(
  DEFAULT_VAULT_ROOT,
  "outputs",
  "pdf-extract",
);

export const DEFAULT_ASSET_OUTPUT_DIR = path.join(
  DEFAULT_VAULT_ROOT,
  "assets",
  "pdf-extract",
);

export const DEFAULT_WORK_DIR = path.join(
  os.tmpdir(),
  "crashboard-pdf-extractor",
);

export const DEFAULT_OPENAI_PDF_MODEL =
  process.env.OPENAI_PDF_EXTRACTOR_MODEL?.trim() || "gpt-5-mini";

export const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;

export const LOW_TEXT_CHARACTER_THRESHOLD = 120;

export const DEFAULT_MAX_AI_PAGES = 8;
