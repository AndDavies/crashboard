import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import sanitizeHtml from "sanitize-html";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isTransientPublicContentError } from "@/lib/blog/errors";

export const BLOG_MEDIA_BUCKET = "blog-media";
const PUBLIC_BLOG_FETCH_TIMEOUT_MS = 8_000;

function publicBlogFetch(input: RequestInfo | URL, init?: RequestInit) {
  const timeout = AbortSignal.timeout(PUBLIC_BLOG_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  return fetch(input, { ...init, signal });
}

const BLOG_SUMMARY_COLUMNS = [
  "id",
  "title",
  "slug",
  "excerpt",
  "status",
  "seo_title",
  "meta_description",
  "canonical_url",
  "cover_image_path",
  "og_image_path",
  "noindex",
  "focus_topic",
  "tags",
  "answer_summary",
  "source_links",
  "related_wiki_slugs",
  "published_at",
  "scheduled_at",
  "deleted_at",
  "created_at",
  "updated_at",
].join(",");

export type BlogPostStatus = "draft" | "published" | "scheduled" | "archived";

export type BlogSourceLink = {
  label: string;
  url: string;
  note?: string;
};

export type BlogPostSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: BlogPostStatus;
  seoTitle: string;
  metaDescription: string;
  canonicalUrl: string | null;
  coverImagePath: string | null;
  coverImageUrl: string | null;
  ogImagePath: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  focusTopic: string;
  tags: string[];
  answerSummary: string;
  sourceLinks: BlogSourceLink[];
  relatedWikiSlugs: string[];
  publishedAt: string | null;
  scheduledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BlogPostDetail = BlogPostSummary & {
  contentJson: Record<string, unknown>;
  contentHtml: string;
};

export type BlogPostRevision = {
  id: string;
  postId: string;
  title: string;
  status: BlogPostStatus;
  createdAt: string;
};

export type BlogPostFilters = {
  q?: string;
  status?: string;
  includeDeleted?: boolean;
};

const EMPTY_TIPTAP_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function isMissingRelation(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.message?.includes("blog_posts") ||
    error.message?.includes("does not exist")
  );
}

function createPublicBlogClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: publicBlogFetch,
      },
    },
  );
}

export function normalizeBlogSlug(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function sanitizeBlogHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: [
      "p",
      "h1",
      "h2",
      "h3",
      "ul",
      "ol",
      "li",
      "aside",
      "div",
      "blockquote",
      "pre",
      "code",
      "hr",
      "strong",
      "em",
      "u",
      "a",
      "span",
      "img",
      "br",
    ],
    allowedAttributes: {
      p: ["class"],
      ul: ["class"],
      ol: ["class"],
      li: ["class"],
      aside: ["class", "aria-label"],
      div: ["class"],
      span: ["class"],
      a: ["href", "target", "rel", "class"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      img: ["http", "https"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}

export function getBlogMediaPublicUrl(path: string | null | undefined) {
  if (!path) return null;
  const supabase = createPublicBlogClient();
  const { data } = supabase.storage.from(BLOG_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asSourceLinks(value: unknown): BlogSourceLink[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const record = asRecord(item);
    const url = typeof record.url === "string" ? record.url.trim() : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const note = typeof record.note === "string" ? record.note.trim() : "";

    if (!url || !label) return [];
    return [{ label, url, ...(note ? { note } : {}) }];
  });
}

function coerceSummary(row: Record<string, unknown>): BlogPostSummary {
  const coverImagePath =
    typeof row.cover_image_path === "string" ? row.cover_image_path : null;
  const ogImagePath =
    typeof row.og_image_path === "string" ? row.og_image_path : null;

  return {
    id: String(row.id),
    title: String(row.title ?? "Untitled post"),
    slug: String(row.slug ?? ""),
    excerpt: String(row.excerpt ?? ""),
    status: row.status as BlogPostStatus,
    seoTitle: String(row.seo_title ?? ""),
    metaDescription: String(row.meta_description ?? ""),
    canonicalUrl:
      typeof row.canonical_url === "string" ? row.canonical_url : null,
    coverImagePath,
    coverImageUrl: getBlogMediaPublicUrl(coverImagePath),
    ogImagePath,
    ogImageUrl: getBlogMediaPublicUrl(ogImagePath),
    noindex: Boolean(row.noindex),
    focusTopic: String(row.focus_topic ?? ""),
    tags: asStringArray(row.tags),
    answerSummary: String(row.answer_summary ?? ""),
    sourceLinks: asSourceLinks(row.source_links),
    relatedWikiSlugs: asStringArray(row.related_wiki_slugs),
    publishedAt:
      typeof row.published_at === "string" ? row.published_at : null,
    scheduledAt:
      typeof row.scheduled_at === "string" ? row.scheduled_at : null,
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function coerceDetail(row: Record<string, unknown>): BlogPostDetail {
  return {
    ...coerceSummary(row),
    contentJson: asRecord(row.content_json),
    contentHtml: String(row.content_html ?? ""),
  };
}

export async function requireDashboardUser() {
  const { dashboardUsesGoogleAuth } = await import("@/lib/dashboard-auth/session");
  if (dashboardUsesGoogleAuth()) {
    const { requireSignedDashboardUser } = await import("@/lib/dashboard-auth/server");
    return requireSignedDashboardUser();
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  return user;
}

export const getPublishedBlogPosts = unstable_cache(
  async (): Promise<BlogPostSummary[]> => {
    try {
      const supabase = createPublicBlogClient();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("blog_posts")
        .select(BLOG_SUMMARY_COLUMNS)
        .is("deleted_at", null)
        .or(
          `and(status.eq.published,published_at.lte.${now}),and(status.eq.scheduled,scheduled_at.lte.${now})`,
        )
        .order("published_at", { ascending: false });

      if (isMissingRelation(error) || isTransientPublicContentError(error)) return [];
      if (error) throw new Error(error.message);

      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
        coerceSummary,
      );
    } catch (error) {
      if (isTransientPublicContentError(error)) return [];
      throw error;
    }
  },
  ["published-blog-posts"],
  { revalidate: 60 },
);

export const getPublishedBlogPostBySlug = cache(async (slug: string) => {
  try {
    const supabase = createPublicBlogClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .eq("slug", slug)
      .is("deleted_at", null)
      .or(
        `and(status.eq.published,published_at.lte.${now}),and(status.eq.scheduled,scheduled_at.lte.${now})`,
      )
      .maybeSingle();

    if (isMissingRelation(error) || isTransientPublicContentError(error)) return null;
    if (error) throw new Error(error.message);
    return data ? coerceDetail(data as Record<string, unknown>) : null;
  } catch (error) {
    if (isTransientPublicContentError(error)) return null;
    throw error;
  }
});

export async function getDashboardBlogPosts(filters: BlogPostFilters) {
  await requireDashboardUser();

  const admin = createAdminClient();
  let query = admin
    .from("blog_posts")
    .select("*");

  if (!filters.includeDeleted) query = query.is("deleted_at", null);
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.q?.trim()) {
    query = query.or(
      `title.ilike.%${filters.q.trim()}%,excerpt.ilike.%${filters.q.trim()}%,slug.ilike.%${filters.q.trim()}%`,
    );
  }

  const { data, error } = await query.order("updated_at", { ascending: false });

  if (isMissingRelation(error)) return [];
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Record<string, unknown>>).map(coerceSummary);
}

export async function getDashboardBlogPost(postId: string) {
  await requireDashboardUser();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("blog_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();

  if (isMissingRelation(error)) return null;
  if (error) throw new Error(error.message);
  return data ? coerceDetail(data as Record<string, unknown>) : null;
}

export async function getDashboardBlogPostRevisions(postId: string) {
  await requireDashboardUser();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("blog_post_revisions")
    .select("id, post_id, title, status, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (isMissingRelation(error)) return [];
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    postId: String(row.post_id),
    title: String(row.title ?? "Untitled post"),
    status: row.status as BlogPostStatus,
    createdAt: String(row.created_at),
  }));
}

export async function getUniqueBlogSlug(
  input: string,
  options: { excludePostId?: string } = {},
) {
  const base = normalizeBlogSlug(input) || "untitled-post";
  const admin = createAdminClient();

  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    let query = admin
      .from("blog_posts")
      .select("id")
      .eq("slug", candidate)
      .is("deleted_at", null)
      .limit(1);

    if (options.excludePostId) {
      query = query.neq("id", options.excludePostId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if ((data ?? []).length === 0) return candidate;
  }

  throw new Error("Could not generate a unique slug.");
}

export function parseContentJson(input: string) {
  if (!input.trim()) return EMPTY_TIPTAP_DOC;
  const parsed: unknown = JSON.parse(input);
  const record = asRecord(parsed);
  if (record.type !== "doc") {
    throw new Error("Invalid editor document.");
  }
  return record;
}
