"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getUniqueBlogSlug,
  normalizeBlogSlug,
  parseContentJson,
  requireDashboardUser,
  sanitizeBlogHtml,
  type BlogPostStatus,
} from "@/lib/blog/data";

const VALID_STATUSES: BlogPostStatus[] = [
  "draft",
  "published",
  "scheduled",
  "archived",
];

function stringField(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function nullableStringField(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value.length > 0 ? value : null;
}

function isoOrNull(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date.");
  }
  return date.toISOString();
}

function urlOrNull(value: string | null) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://.");
  }
  return url.toString();
}

function stringListField(formData: FormData, key: string) {
  const seen = new Set<string>();
  return stringField(formData, key)
    .split(/[,\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function sourceLinksField(formData: FormData) {
  return stringField(formData, "sourceLinks")
    .split(/\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const parts = line.split("|").map((part) => part.trim());
      const rawUrl = parts.length > 1 ? parts[1] : parts[0];
      const label = parts.length > 1 ? parts[0] : rawUrl;
      if (!rawUrl || !label) return [];
      const url = urlOrNull(rawUrl);
      const note = parts[2];
      return [{ label, url, ...(note ? { note } : {}) }];
    });
}

function htmlHasBodyContent(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim().length > 0;
}

function revalidateBlogPaths(slug?: string | null) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/dashboard/content/blog");
}

async function insertRevision(postId: string, userId: string | null) {
  const admin = createAdminClient();
  const { data: post, error: postError } = await admin
    .from("blog_posts")
    .select(
      "title, slug, excerpt, status, content_json, content_html, cover_image_path, published_at, scheduled_at, seo_title, meta_description, canonical_url, og_image_path, noindex, focus_topic, tags, answer_summary, source_links, related_wiki_slugs",
    )
    .eq("id", postId)
    .maybeSingle();

  if (postError) throw new Error(postError.message);
  if (!post) return;

  const { error } = await admin.from("blog_post_revisions").insert({
    post_id: postId,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    status: post.status,
    content_json: post.content_json,
    content_html: post.content_html,
    cover_image_path: post.cover_image_path,
    published_at: post.published_at,
    scheduled_at: post.scheduled_at,
    seo_title: post.seo_title,
    meta_description: post.meta_description,
    canonical_url: post.canonical_url,
    og_image_path: post.og_image_path,
    noindex: post.noindex,
    focus_topic: post.focus_topic,
    tags: post.tags,
    answer_summary: post.answer_summary,
    source_links: post.source_links,
    related_wiki_slugs: post.related_wiki_slugs,
    created_by: userId,
  });

  if (error) throw new Error(error.message);
}

export async function createBlogPostAction(formData: FormData) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const intent = stringField(formData, "intent") || "save";

  const title = stringField(formData, "title") || "Untitled post";
  const requestedSlug = normalizeBlogSlug(stringField(formData, "slug") || title);
  const slug = await getUniqueBlogSlug(requestedSlug);
  const excerpt = stringField(formData, "excerpt");
  const coverImagePath = nullableStringField(formData, "coverImagePath");
  const ogImagePath =
    nullableStringField(formData, "ogImagePath") ?? coverImagePath;
  const contentJson = parseContentJson(stringField(formData, "contentJson"));
  const contentHtml = sanitizeBlogHtml(stringField(formData, "contentHtml"));
  const scheduledAt = isoOrNull(nullableStringField(formData, "scheduledAt"));
  const seoTitle = stringField(formData, "seoTitle");
  const metaDescription = stringField(formData, "metaDescription");
  const canonicalUrl = urlOrNull(nullableStringField(formData, "canonicalUrl"));
  const noindex = formData.get("noindex") === "on";
  const focusTopic = stringField(formData, "focusTopic");
  const tags = stringListField(formData, "tags");
  const answerSummary = stringField(formData, "answerSummary");
  const sourceLinks = sourceLinksField(formData);
  const relatedWikiSlugs = stringListField(formData, "relatedWikiSlugs").map(
    normalizeBlogSlug,
  );

  let status = stringField(formData, "status") as BlogPostStatus;
  if (!VALID_STATUSES.includes(status)) status = "draft";

  let publishedAt: string | null = null;
  let nextScheduledAt: string | null = null;

  if (intent === "publish") {
    if (!stringField(formData, "title")) throw new Error("Add a title before publishing.");
    if (!htmlHasBodyContent(contentHtml)) throw new Error("Add body content before publishing.");
    status = "published";
    publishedAt = new Date().toISOString();
  } else if (intent === "schedule") {
    if (!stringField(formData, "title")) throw new Error("Add a title before scheduling.");
    if (!htmlHasBodyContent(contentHtml)) throw new Error("Add body content before scheduling.");
    if (!scheduledAt) throw new Error("Choose a scheduled publish date.");
    status = "scheduled";
    publishedAt = scheduledAt;
    nextScheduledAt = scheduledAt;
  } else if (status === "published") {
    publishedAt = new Date().toISOString();
  } else if (status === "scheduled") {
    if (!scheduledAt) throw new Error("Choose a scheduled publish date.");
    publishedAt = scheduledAt;
    nextScheduledAt = scheduledAt;
  } else {
    status = "draft";
  }

  const { data, error } = await admin
    .from("blog_posts")
    .insert({
      title,
      slug,
      excerpt,
      status,
      content_json: contentJson,
      content_html: contentHtml,
      cover_image_path: coverImagePath,
      seo_title: seoTitle,
      meta_description: metaDescription,
      canonical_url: canonicalUrl,
      og_image_path: ogImagePath,
      noindex,
      focus_topic: focusTopic,
      tags,
      answer_summary: answerSummary,
      source_links: sourceLinks,
      related_wiki_slugs: relatedWikiSlugs,
      published_at: publishedAt,
      scheduled_at: nextScheduledAt,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await insertRevision(String(data.id), user.id);
  revalidateBlogPaths(slug);
  redirect(`/dashboard/content/blog/${data.id}`);
}

export async function saveBlogPostAction(formData: FormData) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();

  const postId = stringField(formData, "postId");
  if (!postId) throw new Error("Missing post id.");

  const intent = stringField(formData, "intent") || "save";

  const { data: existing, error: existingError } = await admin
    .from("blog_posts")
    .select("slug, status, deleted_at")
    .eq("id", postId)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Post not found.");

  const title = stringField(formData, "title") || "Untitled post";
  const requestedSlug = normalizeBlogSlug(stringField(formData, "slug") || title);
  const slug = await getUniqueBlogSlug(requestedSlug, { excludePostId: postId });
  const excerpt = stringField(formData, "excerpt");
  const coverImagePath = nullableStringField(formData, "coverImagePath");
  const ogImagePath =
    nullableStringField(formData, "ogImagePath") ?? coverImagePath;
  const contentJson = parseContentJson(stringField(formData, "contentJson"));
  const contentHtml = sanitizeBlogHtml(stringField(formData, "contentHtml"));
  const scheduledAt = isoOrNull(nullableStringField(formData, "scheduledAt"));
  const seoTitle = stringField(formData, "seoTitle");
  const metaDescription = stringField(formData, "metaDescription");
  const canonicalUrl = urlOrNull(nullableStringField(formData, "canonicalUrl"));
  const noindex = formData.get("noindex") === "on";
  const focusTopic = stringField(formData, "focusTopic");
  const tags = stringListField(formData, "tags");
  const answerSummary = stringField(formData, "answerSummary");
  const sourceLinks = sourceLinksField(formData);
  const relatedWikiSlugs = stringListField(formData, "relatedWikiSlugs").map(
    normalizeBlogSlug,
  );

  let status = stringField(formData, "status") as BlogPostStatus;
  if (!VALID_STATUSES.includes(status)) status = "draft";

  let publishedAt: string | null = null;
  let nextScheduledAt: string | null = null;
  let deletedAt = (existing as { deleted_at?: string | null }).deleted_at ?? null;

  if (intent === "publish") {
    if (!stringField(formData, "title")) throw new Error("Add a title before publishing.");
    if (!htmlHasBodyContent(contentHtml)) throw new Error("Add body content before publishing.");
    status = "published";
    publishedAt = new Date().toISOString();
    nextScheduledAt = null;
  } else if (intent === "schedule") {
    if (!stringField(formData, "title")) throw new Error("Add a title before scheduling.");
    if (!htmlHasBodyContent(contentHtml)) throw new Error("Add body content before scheduling.");
    if (!scheduledAt) throw new Error("Choose a scheduled publish date.");
    status = "scheduled";
    publishedAt = scheduledAt;
    nextScheduledAt = scheduledAt;
  } else if (intent === "archive") {
    status = "archived";
    publishedAt = null;
    nextScheduledAt = null;
  } else if (intent === "delete") {
    deletedAt = new Date().toISOString();
    status = "archived";
  } else if (intent === "restore") {
    deletedAt = null;
    status = "draft";
  } else {
    if (status === "published") {
      publishedAt = new Date().toISOString();
      nextScheduledAt = null;
    } else if (status === "scheduled") {
      if (!scheduledAt) throw new Error("Choose a scheduled publish date.");
      publishedAt = scheduledAt;
      nextScheduledAt = scheduledAt;
    } else {
      publishedAt = null;
      nextScheduledAt = null;
    }
  }

  const { error } = await admin
    .from("blog_posts")
    .update({
      title,
      slug,
      excerpt,
      status,
      content_json: contentJson,
      content_html: contentHtml,
      cover_image_path: coverImagePath,
      seo_title: seoTitle,
      meta_description: metaDescription,
      canonical_url: canonicalUrl,
      og_image_path: ogImagePath,
      noindex,
      focus_topic: focusTopic,
      tags,
      answer_summary: answerSummary,
      source_links: sourceLinks,
      related_wiki_slugs: relatedWikiSlugs,
      published_at: publishedAt,
      scheduled_at: nextScheduledAt,
      deleted_at: deletedAt,
      updated_by: user.id,
    })
    .eq("id", postId);

  if (error) throw new Error(error.message);

  await insertRevision(postId, user.id);
  revalidateBlogPaths(slug);
  revalidateBlogPaths(String((existing as { slug?: string }).slug ?? ""));

  if (intent === "delete") redirect("/dashboard/content/blog?includeDeleted=true");
  redirect(`/dashboard/content/blog/${postId}`);
}
