import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ASSET_OUTPUT_DIR,
  DEFAULT_MARKDOWN_OUTPUT_DIR,
  DEFAULT_VAULT_ROOT,
} from "@/lib/pdf-extractor/constants";
import { renderExtractionMarkdown } from "@/lib/pdf-extractor/markdown";
import type {
  PdfExtractionResult,
  PdfVisualAsset,
  SavedPdfExtraction,
} from "@/lib/pdf-extractor/types";
import { ensureWithinDirectory } from "@/lib/pdf-extractor/utils";

async function copyAsset(asset: PdfVisualAsset, targetDir: string) {
  const target = path.join(targetDir, path.basename(asset.fileName));
  await fs.copyFile(asset.absolutePath, target);
  return {
    ...asset,
    absolutePath: target,
    relativePath: path.basename(target),
  };
}

export async function saveExtractionCompanion(
  result: PdfExtractionResult,
  options: {
    vaultRoot?: string;
    markdownOutputDir?: string;
    assetOutputDir?: string;
  } = {},
): Promise<SavedPdfExtraction> {
  if (!result.saveEligibility) {
    throw new Error("This extraction result is not eligible to save.");
  }

  const vaultRoot = path.resolve(options.vaultRoot ?? DEFAULT_VAULT_ROOT);
  const markdownOutputDir = ensureWithinDirectory(
    options.markdownOutputDir ?? DEFAULT_MARKDOWN_OUTPUT_DIR,
    vaultRoot,
  );
  const assetOutputRoot = ensureWithinDirectory(
    options.assetOutputDir ?? DEFAULT_ASSET_OUTPUT_DIR,
    vaultRoot,
  );

  const assetDir = ensureWithinDirectory(
    path.join(assetOutputRoot, result.suggestedAssetDirName),
    vaultRoot,
  );
  const markdownPath = ensureWithinDirectory(
    path.join(markdownOutputDir, result.suggestedMarkdownFilename),
    vaultRoot,
  );

  await fs.mkdir(markdownOutputDir, { recursive: true });
  await fs.mkdir(assetDir, { recursive: true });

  const savedAssets = await Promise.all(
    result.visualAssets.map((asset) => copyAsset(asset, assetDir)),
  );
  const savedPages = result.pages.map((page) => ({
    ...page,
    renderedImage: page.renderedImage
      ? savedAssets.find(
          (asset) =>
            asset.kind === page.renderedImage?.kind &&
            asset.pageNumber === page.renderedImage?.pageNumber &&
            path.basename(asset.fileName) === path.basename(page.renderedImage.fileName),
        )
      : undefined,
  }));

  const markdown = renderExtractionMarkdown(
    {
      ...result,
      pages: savedPages,
      visualAssets: savedAssets,
    },
    { markdownOutputDir, assetDir },
  );
  await fs.writeFile(markdownPath, markdown, "utf8");

  return {
    markdownPath,
    assetDir,
    assetCount: savedAssets.length,
  };
}
