#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import allPagesData from "../src/content/wiki/generated/all-pages.json";
import { blogTopics } from "../src/lib/blog/topics";
import { sanitizePublicWikiMarkdown } from "../src/lib/public-wiki/markdown";
import type { PublicWikiPage } from "../src/lib/public-wiki/types";

const root = process.cwd();
const pages = allPagesData as PublicWikiPage[];
const slugs = new Set(pages.map((page) => page.slug));
const errors: string[] = [];

for (const page of pages) {
  const markdown = sanitizePublicWikiMarkdown(page.markdown);
  if (/(?:\.\.\/(?:assets|views)\/|file:\/\/|\/Users\/|\.canvas[)>])/i.test(markdown)) {
    errors.push(`${page.slug}: vault-only reference remains after sanitization`);
  }

  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, "");
    if (href.startsWith("/wiki/")) {
      const linkedSlug = href.slice("/wiki/".length).split(/[?#]/)[0];
      if (!slugs.has(linkedSlug)) {
        errors.push(`${page.slug}: missing wiki target ${href}`);
      }
    }
  }

  for (const linkedSlug of page.linkedSlugs) {
    if (!slugs.has(linkedSlug)) {
      errors.push(`${page.slug}: linkedSlugs contains missing page ${linkedSlug}`);
    }
  }

  const imagePath = path.join(root, "public", page.heroImage.replace(/^\//, ""));
  if (!fs.existsSync(imagePath)) {
    errors.push(`${page.slug}: missing hero image ${page.heroImage}`);
  }
}

for (const topic of blogTopics) {
  for (const wikiSlug of topic.wikiSlugs) {
    if (!slugs.has(wikiSlug)) {
      errors.push(`${topic.slug}: missing topic wiki page ${wikiSlug}`);
    }
  }
  const imagePath = path.join(root, "public", topic.heroImage.replace(/^\//, ""));
  if (!fs.existsSync(imagePath)) {
    errors.push(`${topic.slug}: missing topic image ${topic.heroImage}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `public_content_ok wiki_pages=${pages.length} topic_hubs=${blogTopics.length}`,
  );
}
