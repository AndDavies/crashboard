import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ASSET_OUTPUT_DIR,
  DEFAULT_MARKDOWN_OUTPUT_DIR,
  DEFAULT_RAW_INPUT_DIR,
  extractPdf,
  saveExtractionCompanion,
} from "@/lib/pdf-extractor";

type CliOptions = {
  file?: string;
  url?: string;
  all?: boolean;
  inputRoot: string;
  outputDir: string;
  assetDir: string;
  password?: string;
  pages?: string;
  aiMode: "selective" | "off";
};

function resolveDir(value: string) {
  return path.resolve(value);
}

function commonRoot(paths: string[]) {
  const resolved = paths.map((item) => resolveDir(item).split(path.sep));
  const [first] = resolved;
  if (!first) return process.cwd();

  const common: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const segment = first[index];
    if (resolved.every((parts) => parts[index] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  const joined = common.join(path.sep);
  return joined || path.parse(paths[0] ?? process.cwd()).root;
}

function usage() {
  return `Usage:
  npm run pdf:extract -- --file raw/example.pdf
  npm run pdf:extract -- --all
  npm run pdf:extract -- --url https://example.com/file.pdf

Options:
  --input-root <dir>   Defaults to the Knowledge Base raw folder
  --output-dir <dir>   Defaults to Knowledge Base/outputs/pdf-extract
  --asset-dir <dir>    Defaults to Knowledge Base/assets/pdf-extract
  --password <value>   PDF password for protected files
  --pages <range>      Page range such as 1-5,8
  --no-ai              Skip selective OpenAI visual descriptions
`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputRoot: DEFAULT_RAW_INPUT_DIR,
    outputDir: DEFAULT_MARKDOWN_OUTPUT_DIR,
    assetDir: DEFAULT_ASSET_OUTPUT_DIR,
    aiMode: "selective",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}.`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--file":
        options.file = next();
        break;
      case "--url":
        options.url = next();
        break;
      case "--all":
        options.all = true;
        break;
      case "--input-root":
        options.inputRoot = next();
        break;
      case "--output-dir":
        options.outputDir = next();
        break;
      case "--asset-dir":
        options.assetDir = next();
        break;
      case "--password":
        options.password = next();
        break;
      case "--pages":
        options.pages = next();
        break;
      case "--no-ai":
        options.aiMode = "off";
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function listRawPdfs(inputRoot: string) {
  const entries = await fs.readdir(inputRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(inputRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

async function runOne(source: { type: "path"; path: string } | { type: "url"; url: string }, options: CliOptions) {
  const usingDefaultOutput =
    resolveDir(options.outputDir) === resolveDir(DEFAULT_MARKDOWN_OUTPUT_DIR) &&
    resolveDir(options.assetDir) === resolveDir(DEFAULT_ASSET_OUTPUT_DIR);
  const result = await extractPdf({
    source,
    password: options.password,
    pageRange: options.pages,
    outputMode: "markdown",
    visualMode: "full-assets",
    aiMode: options.aiMode,
    markdownOutputDir: options.outputDir,
    assetOutputDir: options.assetDir,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  if (!result.saveEligibility) {
    console.error(
      `Failed: ${result.metadata.sourceName}\n${result.diagnostics
        .map((item) => `- ${item.code}: ${item.message}`)
        .join("\n")}`,
    );
    return false;
  }

  const saved = await saveExtractionCompanion(result, {
    vaultRoot: usingDefaultOutput
      ? undefined
      : commonRoot([options.outputDir, options.assetDir]),
    markdownOutputDir: options.outputDir,
    assetOutputDir: options.assetDir,
  });
  console.log(
    `Extracted ${result.metadata.sourceName} -> ${saved.markdownPath} (${saved.assetCount} assets, ${result.status})`,
  );
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.url) {
    const ok = await runOne({ type: "url", url: options.url }, options);
    process.exit(ok ? 0 : 1);
  }

  if (options.file) {
    const filePath = path.isAbsolute(options.file)
      ? options.file
      : path.join(options.inputRoot, options.file);
    const ok = await runOne({ type: "path", path: filePath }, options);
    process.exit(ok ? 0 : 1);
  }

  if (options.all) {
    const files = await listRawPdfs(options.inputRoot);
    let failures = 0;
    for (const filePath of files) {
      const ok = await runOne({ type: "path", path: filePath }, options);
      if (!ok) failures += 1;
    }
    process.exit(failures === 0 ? 0 : 1);
  }

  console.error(usage());
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
