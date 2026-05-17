"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  QuoteIcon,
  Redo2Icon,
  SaveIcon,
  SendIcon,
  SparklesIcon,
  Trash2Icon,
  UnderlineIcon,
  Undo2Icon,
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
} from "lucide-react";
import { createBlogPostAction, saveBlogPostAction } from "@/lib/blog/actions";
import {
  BLOG_IMAGE_FORMATS,
  BLOG_IMAGE_PROMPT_TEMPLATE,
  BLOG_IMAGE_STYLE_RULES,
} from "@/lib/blog/image-guidelines";
import {
  looksLikeMarkdownContent,
  markdownToBlogHtml,
} from "@/lib/blog/markdown";
import type {
  BlogPostDetail,
  BlogPostRevision,
  BlogSourceLink,
} from "@/lib/blog/data";
import type { BlogEnrichmentResult } from "@/lib/blog/enrichment-types";
import type { BlogPostStarter } from "@/lib/blog/starter-posts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const panelClass =
  "rounded-xl border border-foreground/15 bg-card p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)]";
const fieldClass =
  "h-10 rounded-md border border-foreground/20 bg-white px-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/45 focus-visible:ring-2 focus-visible:ring-accent/45";
const textareaClass =
  "w-full rounded-md border border-foreground/20 bg-white px-3 py-2.5 text-sm leading-relaxed shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/45 focus-visible:ring-2 focus-visible:ring-accent/45";
const selectClass =
  "h-10 w-full rounded-md border border-foreground/20 bg-white px-3 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition-colors focus-visible:border-foreground/45 focus-visible:ring-2 focus-visible:ring-accent/45";
const helperClass = "text-xs leading-relaxed text-muted-foreground";

function sourceLinksToText(links: BlogSourceLink[]) {
  return links
    .map((link) => [link.label, link.url, link.note].filter(Boolean).join(" | "))
    .join("\n");
}

function slugLooksValid(input: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.trim());
}

function tagsTextToArray(input: string) {
  const seen = new Set<string>();
  return input
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

function ToolbarButton({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-foreground/15 bg-white text-muted-foreground shadow-sm transition-colors hover:border-foreground/25 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45",
        active && "border-foreground/30 bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-foreground/15 bg-white p-3 shadow-sm">
      <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-foreground">{value}</p>
    </div>
  );
}

function GeneratedPromptCard({
  prompt,
  copied,
  onCopy,
}: {
  prompt: BlogEnrichmentResult["imagePrompts"]["cover"];
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-foreground/15 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{prompt.label}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {prompt.dimensions} / {prompt.ratio}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <CopyIcon className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-foreground/15 bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
        {prompt.prompt}
      </pre>
    </div>
  );
}

export function BlogPostEditor({
  post,
  revisions = [],
  starterPost,
}: {
  post?: BlogPostDetail;
  revisions?: BlogPostRevision[];
  starterPost?: BlogPostStarter;
}) {
  const isEditing = Boolean(post);
  const editorPost = post ?? {
    id: "new",
    title: starterPost?.title ?? "",
    slug: starterPost?.slug ?? "",
    excerpt: starterPost?.excerpt ?? "",
    status: "draft",
    contentJson: starterPost?.contentJson ?? EMPTY_DOC,
    contentHtml: starterPost?.contentHtml ?? "",
    coverImagePath: null,
    coverImageUrl: null,
    seoTitle: starterPost?.seoTitle ?? "",
    metaDescription: starterPost?.metaDescription ?? "",
    canonicalUrl: null,
    ogImagePath: null,
    ogImageUrl: null,
    noindex: false,
    focusTopic: starterPost?.focusTopic ?? "",
    tags: starterPost?.tags ?? [],
    answerSummary: starterPost?.answerSummary ?? "",
    sourceLinks: starterPost?.sourceLinks ?? [],
    relatedWikiSlugs: starterPost?.relatedWikiSlugs ?? [],
    publishedAt: null,
    scheduledAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } satisfies BlogPostDetail;

  const [contentJson, setContentJson] = useState(() =>
    JSON.stringify(editorPost.contentJson ?? EMPTY_DOC),
  );
  const [contentHtml, setContentHtml] = useState(editorPost.contentHtml ?? "");
  const [coverImagePath, setCoverImagePath] = useState(editorPost.coverImagePath ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(editorPost.coverImageUrl ?? "");
  const [ogImagePath, setOgImagePath] = useState(editorPost.ogImagePath ?? "");
  const [titleValue, setTitleValue] = useState(editorPost.title);
  const [slugValue, setSlugValue] = useState(editorPost.slug);
  const [excerptValue, setExcerptValue] = useState(editorPost.excerpt);
  const [seoTitleValue, setSeoTitleValue] = useState(editorPost.seoTitle);
  const [metaDescriptionValue, setMetaDescriptionValue] = useState(
    editorPost.metaDescription,
  );
  const [canonicalUrlValue, setCanonicalUrlValue] = useState(
    editorPost.canonicalUrl ?? "",
  );
  const [focusTopicValue, setFocusTopicValue] = useState(editorPost.focusTopic);
  const [tagsValue, setTagsValue] = useState(editorPost.tags.join(", "));
  const [answerSummaryValue, setAnswerSummaryValue] = useState(
    editorPost.answerSummary,
  );
  const [relatedWikiSlugsValue, setRelatedWikiSlugsValue] = useState(
    editorPost.relatedWikiSlugs.join(", "),
  );
  const [sourceLinksValue, setSourceLinksValue] = useState(
    sourceLinksToText(editorPost.sourceLinks),
  );
  const [noindexValue, setNoindexValue] = useState(editorPost.noindex);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [enrichment, setEnrichment] = useState<BlogEnrichmentResult | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const [enrichmentAppliedAt, setEnrichmentAppliedAt] = useState<string | null>(
    null,
  );
  const [copiedGeneratedPrompt, setCopiedGeneratedPrompt] = useState<string | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const initialContent = useMemo(() => {
    return Object.keys(editorPost.contentJson).length > 0
      ? editorPost.contentJson
      : EMPTY_DOC;
  }, [editorPost.contentJson]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      ImageExtension.configure({
        allowBase64: false,
      }),
      Placeholder.configure({
        placeholder: "Write the post...",
      }),
    ],
    content: initialContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[28rem] px-4 py-4 text-base leading-8 outline-none md:px-5",
      },
      handlePaste(_view, event) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const html = event.clipboardData?.getData("text/html") ?? "";
        const activeEditor = editorRef.current;

        if (!activeEditor || html || !looksLikeMarkdownContent(text)) {
          return false;
        }

        const nextHtml = markdownToBlogHtml(text);
        if (!nextHtml) return false;

        event.preventDefault();
        activeEditor.chain().focus().insertContent(nextHtml).run();
        return true;
      },
    },
    onUpdate({ editor: activeEditor }) {
      setContentJson(JSON.stringify(activeEditor.getJSON()));
      setContentHtml(activeEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    setContentJson(JSON.stringify(editor.getJSON()));
    setContentHtml(editor.getHTML());
    return () => {
      if (editorRef.current === editor) editorRef.current = null;
    };
  }, [editor]);

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("postId", editorPost.id);

    try {
      const response = await fetch("/dashboard/content/blog/media", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as {
        path?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.path || !payload.url) {
        throw new Error(payload.error ?? "Upload failed.");
      }
      return payload;
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function onInlineImageSelected(file: File | undefined) {
    if (!file || !editor) return;
    const uploaded = await uploadImage(file);
    if (uploaded?.url) {
      editor.chain().focus().setImage({ src: uploaded.url, alt: file.name }).run();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onCoverImageSelected(file: File | undefined) {
    if (!file) return;
    const uploaded = await uploadImage(file);
    if (uploaded?.path && uploaded.url) {
      const uploadedPath = uploaded.path;
      setCoverImagePath(uploaded.path);
      setCoverImageUrl(uploaded.url);
      setOgImagePath((current) => current || uploadedPath);
    }
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl ?? "");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url.trim() }).run();
  }

  async function copyImagePrompt() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(BLOG_IMAGE_PROMPT_TEMPLATE);
      setCopiedPrompt(true);
      window.setTimeout(() => setCopiedPrompt(false), 1800);
    } catch {
      setCopiedPrompt(false);
    }
  }

  async function runAiEnrichment() {
    setEnriching(true);
    setEnrichmentError(null);

    try {
      const activeHtml = editor?.getHTML() ?? contentHtml;
      const activeJson = editor ? JSON.stringify(editor.getJSON()) : contentJson;
      const response = await fetch("/dashboard/content/blog/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentHtml: activeHtml,
          contentJson: activeJson,
          title: titleValue,
          slug: slugValue,
          excerpt: excerptValue,
          seoTitle: seoTitleValue,
          metaDescription: metaDescriptionValue,
          focusTopic: focusTopicValue,
          tags: tagsTextToArray(tagsValue),
          answerSummary: answerSummaryValue,
          relatedWikiSlugs: tagsTextToArray(relatedWikiSlugsValue),
        }),
      });
      const payload = (await response.json()) as {
        enrichment?: BlogEnrichmentResult;
        error?: string;
      };

      if (!response.ok || !payload.enrichment) {
        throw new Error(payload.error ?? "AI enrichment failed.");
      }

      setEnrichment(payload.enrichment);
      applyEnrichmentResult(payload.enrichment);
    } catch (error) {
      setEnrichmentError(
        error instanceof Error ? error.message : "AI enrichment failed.",
      );
    } finally {
      setEnriching(false);
    }
  }

  function applyEnrichmentResult(result: BlogEnrichmentResult) {
    setTitleValue(result.title);
    setSlugValue(result.slug);
    setExcerptValue(result.excerpt);
    setSeoTitleValue(result.seoTitle);
    setMetaDescriptionValue(result.metaDescription);
    setFocusTopicValue(result.focusTopic);
    setTagsValue(result.tags.join(", "));
    setAnswerSummaryValue(result.answerSummary);
    setRelatedWikiSlugsValue(result.relatedWikiSlugs.join(", "));
    setEnrichmentAppliedAt(new Date().toLocaleTimeString());
  }

  async function copyGeneratedPrompt(key: string, text: string) {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedGeneratedPrompt(key);
      window.setTimeout(() => setCopiedGeneratedPrompt(null), 1800);
    } catch {
      setCopiedGeneratedPrompt(null);
    }
  }

  function generatedPromptText() {
    if (!enrichment) return "";
    return [
      enrichment.imagePrompts.cover,
      enrichment.imagePrompts.inlineWide,
      enrichment.imagePrompts.inlineSquare,
    ]
      .map(
        (prompt) =>
          `${prompt.label} (${prompt.dimensions} / ${prompt.ratio})\n\n${prompt.prompt}`,
      )
      .join("\n\n---\n\n");
  }

  const seoWarnings = [
    !metaDescriptionValue.trim()
      ? "Add a meta description for snippets and link previews."
      : null,
    !slugLooksValid(slugValue)
      ? "Use a readable lowercase slug with hyphens."
      : null,
    !answerSummaryValue.trim()
      ? "Add a short answer summary near the top of the public post."
      : null,
    !focusTopicValue.trim() || !tagsValue.trim()
      ? "Add a focus topic and a few tags."
      : null,
    !relatedWikiSlugsValue.trim()
      ? "Link at least one related wiki page when one exists."
      : null,
    !coverImagePath && !ogImagePath
      ? "Add a cover or social image."
      : null,
    !/<a\s/i.test(contentHtml)
      ? "Add at least one relevant internal or source link in the body."
      : null,
  ].filter((warning): warning is string => Boolean(warning));

  const bodyHasText = contentHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim().length > 0;
  const publishWarnings = [
    !titleValue.trim() ? "Publishing requires a title." : null,
    !bodyHasText ? "Publishing requires body content." : null,
  ].filter((warning): warning is string => Boolean(warning));

  return (
    <form action={isEditing ? saveBlogPostAction : createBlogPostAction} className="space-y-8">
      {isEditing ? <input type="hidden" name="postId" value={editorPost.id} /> : null}
      <input type="hidden" name="contentJson" value={contentJson} />
      <input type="hidden" name="contentHtml" value={contentHtml} />
      <input type="hidden" name="coverImagePath" value={coverImagePath} />
      <input type="hidden" name="ogImagePath" value={ogImagePath} />

      <section className={panelClass}>
        <div className="flex flex-col gap-4 border-b border-foreground/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
              Article fields
            </p>
            <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
              Details, metadata, and publishing
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Leave these blank while drafting. After the body is in the editor,
              run enrichment to fill the article title, slug, excerpt, SEO
              fields, answer summary, tags, and related wiki links.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:flex-col lg:items-end">
            <Button
              type="button"
              size="lg"
              onClick={() => void runAiEnrichment()}
              disabled={enriching}
              className="h-10 px-4"
            >
              {enriching ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              {enriching ? "Enriching" : "AI Enrichment"}
            </Button>
            <p className="max-w-56 text-xs leading-relaxed text-muted-foreground lg:text-right">
              {enrichmentAppliedAt
                ? `Last populated at ${enrichmentAppliedAt}`
                : "Uses the current editor body and existing field values."}
            </p>
          </div>
        </div>

        {enrichmentError ? (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {enrichmentError}
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <div className="rounded-lg border border-foreground/10 bg-muted/15 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">
                    Article identity
                  </h3>
                  <p className={helperClass}>
                    These values define the public URL, blog listing, and publish
                    state.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    value={titleValue}
                    onChange={(event) => setTitleValue(event.target.value)}
                    className={fieldClass}
                    placeholder="The public article title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    name="slug"
                    value={slugValue}
                    onChange={(event) => setSlugValue(event.target.value)}
                    className={fieldClass}
                    placeholder="lowercase-hyphenated-url"
                  />
                  <p className={helperClass}>
                    Public URL: {slugValue ? `/blog/${slugValue}` : "/blog/..."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={editorPost.status}
                    className={selectClass}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </select>
                  <p className={helperClass}>
                    Publishing makes the post live immediately unless scheduled.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="excerpt">Excerpt</Label>
                  <textarea
                    id="excerpt"
                    name="excerpt"
                    value={excerptValue}
                    onChange={(event) => setExcerptValue(event.target.value)}
                    rows={3}
                    className={textareaClass}
                    placeholder="Short listing summary for the blog index"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="scheduledAt">Scheduled publish time</Label>
                  <Input
                    id="scheduledAt"
                    name="scheduledAt"
                    type="datetime-local"
                    defaultValue={
                      editorPost.scheduledAt
                        ? new Date(editorPost.scheduledAt).toISOString().slice(0, 16)
                        : ""
                    }
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-foreground/10 bg-muted/15 p-4">
              <div className="mb-4">
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  SEO and answer metadata
                </h3>
                <p className={helperClass}>
                  These fields drive search snippets, article schema, tags, and
                  the short answer block on public posts.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="seoTitle">SEO title</Label>
                  <Input
                    id="seoTitle"
                    name="seoTitle"
                    value={seoTitleValue}
                    onChange={(event) => setSeoTitleValue(event.target.value)}
                    className={fieldClass}
                    placeholder="Defaults to post title"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="focusTopic">Focus topic</Label>
                  <Input
                    id="focusTopic"
                    name="focusTopic"
                    value={focusTopicValue}
                    onChange={(event) => setFocusTopicValue(event.target.value)}
                    className={fieldClass}
                    placeholder="AI workflow systems"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="metaDescription">Meta description</Label>
                  <textarea
                    id="metaDescription"
                    name="metaDescription"
                    value={metaDescriptionValue}
                    onChange={(event) => setMetaDescriptionValue(event.target.value)}
                    rows={2}
                    className={textareaClass}
                    placeholder="Concise summary for search snippets and social previews."
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="answerSummary">Answer summary</Label>
                  <textarea
                    id="answerSummary"
                    name="answerSummary"
                    value={answerSummaryValue}
                    onChange={(event) => setAnswerSummaryValue(event.target.value)}
                    rows={3}
                    className={textareaClass}
                    placeholder="What should a reader or answer system understand first?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    name="tags"
                    value={tagsValue}
                    onChange={(event) => setTagsValue(event.target.value)}
                    className={fieldClass}
                    placeholder="ai workflows, knowledge systems"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="relatedWikiSlugs">Related wiki slugs</Label>
                  <Input
                    id="relatedWikiSlugs"
                    name="relatedWikiSlugs"
                    value={relatedWikiSlugsValue}
                    onChange={(event) => setRelatedWikiSlugsValue(event.target.value)}
                    className={fieldClass}
                    placeholder="personal-knowledge-systems"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="sourceLinks">Source links</Label>
                  <textarea
                    id="sourceLinks"
                    name="sourceLinks"
                    value={sourceLinksValue}
                    onChange={(event) => setSourceLinksValue(event.target.value)}
                    rows={4}
                    className={textareaClass}
                    placeholder="Label | https://example.com/source | optional note"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="canonicalUrl">Canonical URL</Label>
                  <Input
                    id="canonicalUrl"
                    name="canonicalUrl"
                    value={canonicalUrlValue}
                    onChange={(event) => setCanonicalUrlValue(event.target.value)}
                    className={fieldClass}
                    placeholder="Leave blank to use this post URL"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-muted-foreground md:col-span-2">
                  <input
                    type="checkbox"
                    name="noindex"
                    checked={noindexValue}
                    onChange={(event) => setNoindexValue(event.target.checked)}
                    className="size-4 rounded border-foreground/30 bg-white"
                  />
                  Noindex this post
                </label>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-foreground/10 bg-muted/15 p-4">
              <p className="text-sm font-medium text-foreground">Cover image</p>
              <div className="relative mt-3 aspect-[1200/630] overflow-hidden rounded-md border border-foreground/15 bg-white shadow-sm">
                {coverImageUrl ? (
                  <Image
                    src={coverImageUrl}
                    alt=""
                    fill
                    sizes="20rem"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                    No cover image
                  </div>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  void onCoverImageSelected(event.target.files?.[0]);
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full bg-white"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploading}
              >
                Upload cover
              </Button>
              {uploadError ? (
                <p className="mt-2 text-sm text-destructive">{uploadError}</p>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-foreground/10 bg-muted/15 p-4">
              <div className="flex items-center gap-2 text-sm">
                {seoWarnings.length === 0 && publishWarnings.length === 0 ? (
                  <>
                    <CheckCircle2Icon className="size-4 text-green-600" />
                    <span className="font-medium text-foreground">Ready</span>
                  </>
                ) : (
                  <>
                    <AlertCircleIcon className="size-4 text-amber-600" />
                    <span className="font-medium text-foreground">
                      {seoWarnings.length + publishWarnings.length} note
                      {seoWarnings.length + publishWarnings.length === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>

              <PreviewField
                label="Public URL"
                value={slugValue ? `/blog/${slugValue}` : "Not set"}
              />
              <PreviewField
                label="Search title"
                value={seoTitleValue || titleValue || "Not set"}
              />
              <PreviewField
                label="Tags"
                value={tagsValue.trim() || "Not set"}
              />

              {publishWarnings.length > 0 || seoWarnings.length > 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  {publishWarnings.length > 0 ? (
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Required before publish
                      </p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {publishWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {seoWarnings.length > 0 ? (
                    <div className={publishWarnings.length > 0 ? "mt-4" : ""}>
                      <p className="text-sm font-medium text-foreground">
                        Advisory SEO/AEO notes
                      </p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                        {seoWarnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        {enrichment ? (
          <div className="mt-5 rounded-lg border border-foreground/10 bg-muted/15 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  AI enrichment output
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  The fields above were populated from the current article body.
                  Image prompts are copy-only and do not change the post.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="bg-white"
                onClick={() => void copyGeneratedPrompt("all", generatedPromptText())}
              >
                <CopyIcon className="size-4" />
                {copiedGeneratedPrompt === "all" ? "Copied" : "Copy all prompts"}
              </Button>
            </div>

            {enrichment.warnings.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm font-medium text-foreground">
                  Review notes
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  {enrichment.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <GeneratedPromptCard
                prompt={enrichment.imagePrompts.cover}
                copied={copiedGeneratedPrompt === "cover"}
                onCopy={() =>
                  void copyGeneratedPrompt(
                    "cover",
                    enrichment.imagePrompts.cover.prompt,
                  )
                }
              />
              <GeneratedPromptCard
                prompt={enrichment.imagePrompts.inlineWide}
                copied={copiedGeneratedPrompt === "inlineWide"}
                onCopy={() =>
                  void copyGeneratedPrompt(
                    "inlineWide",
                    enrichment.imagePrompts.inlineWide.prompt,
                  )
                }
              />
              <GeneratedPromptCard
                prompt={enrichment.imagePrompts.inlineSquare}
                copied={copiedGeneratedPrompt === "inlineSquare"}
                onCopy={() =>
                  void copyGeneratedPrompt(
                    "inlineSquare",
                    enrichment.imagePrompts.inlineSquare.prompt,
                  )
                }
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-xl border border-foreground/15 bg-card shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-foreground/10 p-5">
          <p className="font-mono text-xs tracking-[0.16em] text-muted-foreground uppercase">
            Body
          </p>
          <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
            Article content
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Paste Markdown or write directly. This is the content AI enrichment
            reads when it fills the metadata section above.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-foreground/10 bg-muted/25 p-3">
          <ToolbarButton
            label="Heading 1"
            active={editor?.isActive("heading", { level: 1 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1Icon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            active={editor?.isActive("heading", { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2Icon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Bold"
            active={editor?.isActive("bold")}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <BoldIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor?.isActive("italic")}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Underline"
            active={editor?.isActive("underline")}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            active={editor?.isActive("bulletList")}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ListIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Ordered list"
            active={editor?.isActive("orderedList")}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrderedIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Blockquote"
            active={editor?.isActive("blockquote")}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <QuoteIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Code block"
            active={editor?.isActive("codeBlock")}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          >
            <CodeIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton label="Link" active={editor?.isActive("link")} onClick={setLink}>
            <LinkIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Image"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Undo"
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2Icon className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2Icon className="size-4" />
          </ToolbarButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              void onInlineImageSelected(event.target.files?.[0]);
            }}
          />
        </div>
        <div className="blog-editor bg-white">
          <EditorContent editor={editor} />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-foreground/15 bg-card p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">
          {isEditing
            ? `Last updated ${new Date(editorPost.updatedAt).toLocaleString()}`
            : "New post"}
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditing ? (
            <Button
              nativeButton={false}
              variant="outline"
              className="bg-white"
              render={<Link href={`/dashboard/content/blog/${editorPost.id}/preview`} />}
            >
              Preview
            </Button>
          ) : null}
          <Button type="submit" name="intent" value="save" variant="outline" className="bg-white">
            <SaveIcon className="size-4" />
            Save draft
          </Button>
          <Button type="submit" name="intent" value="schedule" variant="outline" className="bg-white">
            Schedule
          </Button>
          <Button type="submit" name="intent" value="publish">
            <SendIcon className="size-4" />
            Publish
          </Button>
          {isEditing ? (
            <>
              <Button type="submit" name="intent" value="archive" variant="outline" className="bg-white">
                Archive
              </Button>
              {editorPost.deletedAt ? (
                <Button type="submit" name="intent" value="restore" variant="outline" className="bg-white">
                  Restore
                </Button>
              ) : (
                <Button type="submit" name="intent" value="delete" variant="destructive">
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              )}
            </>
          ) : null}
        </div>
      </section>

      <section className={panelClass}>
        <div className="flex flex-col gap-3 border-b border-foreground/10 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-heading text-base font-semibold text-foreground">
              Image system
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Use the same visual language for covers and article images so the
              blog reads as one connected research system.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="bg-white"
            onClick={() => void copyImagePrompt()}
          >
            <CopyIcon className="size-4" />
            {copiedPrompt ? "Copied" : "Copy prompt"}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
	          {BLOG_IMAGE_FORMATS.map((format) => (
            <div
              key={format.id}
              className="rounded-lg border border-foreground/15 bg-white p-4 shadow-sm"
            >
              <p className="text-sm font-medium text-foreground">{format.label}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {format.dimensions} / {format.ratio}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {format.use}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <p className="text-sm font-medium text-foreground">Prompt template</p>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-foreground/15 bg-white p-4 text-xs leading-6 text-muted-foreground shadow-sm">{BLOG_IMAGE_PROMPT_TEMPLATE}</pre>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Style rules</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
              {BLOG_IMAGE_STYLE_RULES.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {revisions.length > 0 ? (
        <section className={panelClass}>
          <h2 className="font-heading text-base font-semibold text-foreground">
            Recent revisions
          </h2>
          <ul className="mt-4 divide-y divide-border/80 text-sm">
            {revisions.map((revision) => (
              <li
                key={revision.id}
                className="flex items-center justify-between gap-4 py-2"
              >
                <span className="truncate text-foreground">{revision.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {revision.status} · {new Date(revision.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </form>
  );
}
