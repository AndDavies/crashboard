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

function revalidateBlogPaths(slug?: string | null) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/dashboard/content/blog");
}

async function insertRevision(postId: string, userId: string | null) {
  const admin = createAdminClient();
  const { data: post, error: postError } = await admin
    .from("blog_posts")
    .select(
      "title, slug, excerpt, status, content_json, content_html, cover_image_path, published_at, scheduled_at",
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
    created_by: userId,
  });

  if (error) throw new Error(error.message);
}

export async function createBlogPostAction(formData: FormData) {
  const user = await requireDashboardUser();
  const admin = createAdminClient();
  const rawTitle = stringField(formData, "title");
  const title = rawTitle || "Untitled post";
  const slug = await getUniqueBlogSlug(title);

  const { data, error } = await admin
    .from("blog_posts")
    .insert({
      title,
      slug,
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
  const contentJson = parseContentJson(stringField(formData, "contentJson"));
  const contentHtml = sanitizeBlogHtml(stringField(formData, "contentHtml"));
  const scheduledAt = isoOrNull(nullableStringField(formData, "scheduledAt"));

  let status = stringField(formData, "status") as BlogPostStatus;
  if (!VALID_STATUSES.includes(status)) status = "draft";

  let publishedAt: string | null = null;
  let nextScheduledAt: string | null = null;
  let deletedAt = (existing as { deleted_at?: string | null }).deleted_at ?? null;

  if (intent === "publish") {
    status = "published";
    publishedAt = new Date().toISOString();
    nextScheduledAt = null;
  } else if (intent === "schedule") {
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
