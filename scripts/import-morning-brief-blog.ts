#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_MORNING_BRIEF_SOURCE,
  assertUniqueMorningBriefSlugs,
  transformMorningBriefReport,
  type MorningBriefBlogDraft,
} from "@/lib/blog/morning-brief-import";

type ImportStatus = "draft" | "published";

type ImportOptions = {
  source: string;
  apply: boolean;
  status: ImportStatus;
  updateExisting: boolean;
};

type ExistingPost = {
  id: string;
  slug: string;
};

const WORKDIR = process.cwd();
const ENV_PATH = path.join(WORKDIR, ".env.local");

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function usage() {
  return `Usage: npm run import:morning-brief-blog -- [options]

Options:
  --source <path>          Raw Morning Brief folder.
  --apply                  Write rows to Supabase. Omit for dry-run.
  --status draft|published Import status. Default: draft.
  --update-existing        Update active posts that already use generated slugs.
  --help                   Show this help.
`;
}

function readArgValue(args: string[], index: number, name: string) {
  const inline = args[index].match(new RegExp(`^${name}=(.+)$`));
  if (inline) return { value: inline[1], nextIndex: index };
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return { value, nextIndex: index + 1 };
}

function parseArgs(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    source: DEFAULT_MORNING_BRIEF_SOURCE,
    apply: false,
    status: "draft",
    updateExisting: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--update-existing") {
      options.updateExisting = true;
      continue;
    }
    if (arg === "--source" || arg.startsWith("--source=")) {
      const { value, nextIndex } = readArgValue(argv, i, "--source");
      options.source = value;
      i = nextIndex;
      continue;
    }
    if (arg === "--status" || arg.startsWith("--status=")) {
      const { value, nextIndex } = readArgValue(argv, i, "--status");
      if (value !== "draft" && value !== "published") {
        throw new Error("--status must be draft or published.");
      }
      options.status = value;
      i = nextIndex;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function readJsonFile(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${filePath}: ${message}`);
  }
}

function loadDrafts(source: string) {
  if (!fs.existsSync(source)) {
    throw new Error(`Source folder does not exist: ${source}`);
  }

  const jsonFiles = fs
    .readdirSync(source)
    .filter((name) => name.endsWith(".json") && !name.startsWith("."))
    .sort();

  const drafts = jsonFiles.map((jsonFile) => {
    const jsonPath = path.join(source, jsonFile);
    const markdownPath = jsonPath.replace(/\.json$/i, ".md");
    if (!fs.existsSync(markdownPath)) {
      throw new Error(`Missing paired Markdown file for ${jsonPath}`);
    }

    return transformMorningBriefReport({
      fileName: jsonFile,
      json: readJsonFile(jsonPath),
      markdown: fs.readFileSync(markdownPath, "utf8"),
    });
  });

  assertUniqueMorningBriefSlugs(drafts);
  return drafts;
}

function publishedAtFor(draft: MorningBriefBlogDraft, status: ImportStatus) {
  return status === "published" ? `${draft.reportDate}T12:00:00.000Z` : null;
}

function postPayload(draft: MorningBriefBlogDraft, status: ImportStatus) {
  return {
    title: draft.title,
    slug: draft.slug,
    excerpt: draft.excerpt,
    status,
    content_json: draft.contentJson,
    content_html: draft.contentHtml,
    cover_image_path: null,
    published_at: publishedAtFor(draft, status),
    scheduled_at: null,
    seo_title: draft.seoTitle,
    meta_description: draft.metaDescription,
    canonical_url: null,
    og_image_path: null,
    noindex: false,
    focus_topic: draft.focusTopic,
    tags: draft.tags,
    answer_summary: draft.answerSummary,
    source_links: draft.sourceLinks,
    related_wiki_slugs: draft.relatedWikiSlugs,
  };
}

async function fetchExistingPosts(
  admin: ReturnType<typeof createAdminClient>,
  slugs: string[],
) {
  if (slugs.length === 0) return new Map<string, ExistingPost>();

  const { data, error } = await admin
    .from("blog_posts")
    .select("id, slug")
    .in("slug", slugs)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  return new Map(
    ((data ?? []) as ExistingPost[]).map((post) => [post.slug, post]),
  );
}

async function insertRevision(
  admin: ReturnType<typeof createAdminClient>,
  postId: string,
  payload: ReturnType<typeof postPayload>,
) {
  const { error } = await admin.from("blog_post_revisions").insert({
    post_id: postId,
    title: payload.title,
    slug: payload.slug,
    excerpt: payload.excerpt,
    status: payload.status,
    content_json: payload.content_json,
    content_html: payload.content_html,
    cover_image_path: payload.cover_image_path,
    published_at: payload.published_at,
    scheduled_at: payload.scheduled_at,
    seo_title: payload.seo_title,
    meta_description: payload.meta_description,
    canonical_url: payload.canonical_url,
    og_image_path: payload.og_image_path,
    noindex: payload.noindex,
    focus_topic: payload.focus_topic,
    tags: payload.tags,
    answer_summary: payload.answer_summary,
    source_links: payload.source_links,
    related_wiki_slugs: payload.related_wiki_slugs,
  });

  if (error) throw new Error(error.message);
}

async function applyDrafts(options: ImportOptions, drafts: MorningBriefBlogDraft[]) {
  loadDotEnv(ENV_PATH);
  const admin = createAdminClient();
  const existing = await fetchExistingPosts(
    admin,
    drafts.map((draft) => draft.slug),
  );

  if (existing.size > 0 && !options.updateExisting) {
    const slugs = Array.from(existing.keys()).sort().join(", ");
    throw new Error(
      `Active blog posts already exist for generated slugs: ${slugs}. Rerun with --update-existing to overwrite them.`,
    );
  }

  let inserted = 0;
  let updated = 0;

  for (const draft of drafts) {
    const payload = postPayload(draft, options.status);
    const existingPost = existing.get(draft.slug);

    if (existingPost) {
      const { error } = await admin
        .from("blog_posts")
        .update(payload)
        .eq("id", existingPost.id);
      if (error) throw new Error(error.message);
      await insertRevision(admin, existingPost.id, payload);
      updated += 1;
      continue;
    }

    const { data, error } = await admin
      .from("blog_posts")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    await insertRevision(admin, String(data.id), payload);
    inserted += 1;
  }

  return { inserted, updated };
}

function printSummary(
  options: ImportOptions,
  drafts: MorningBriefBlogDraft[],
  result?: { inserted: number; updated: number },
) {
  const sourceLinks = drafts.reduce((sum, draft) => sum + draft.sourceLinks.length, 0);
  const sourceCounts = drafts.map((draft) => draft.sourceLinks.length);
  const minSources = Math.min(...sourceCounts);
  const maxSources = Math.max(...sourceCounts);

  console.log(`source=${options.source}`);
  console.log(`mode=${options.apply ? "apply" : "dry-run"}`);
  console.log(`status=${options.status}`);
  console.log(`eligible_posts=${drafts.length}`);
  console.log(`paired_json_markdown_files=${drafts.length}`);
  console.log(`unique_slugs=${new Set(drafts.map((draft) => draft.slug)).size}`);
  console.log(`source_links_total=${sourceLinks}`);
  console.log(`source_links_min=${minSources}`);
  console.log(`source_links_max=${maxSources}`);
  console.log(`first_slug=${drafts[0]?.slug ?? ""}`);
  console.log(`last_slug=${drafts.at(-1)?.slug ?? ""}`);
  if (result) {
    console.log(`inserted=${result.inserted}`);
    console.log(`updated=${result.updated}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const drafts = loadDrafts(options.source);

  if (!options.apply) {
    printSummary(options, drafts);
    return;
  }

  const result = await applyDrafts(options, drafts);
  printSummary(options, drafts, result);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
