"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
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
  QuoteIcon,
  Redo2Icon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  UnderlineIcon,
  Undo2Icon,
} from "lucide-react";
import { createBlogPostAction, saveBlogPostAction } from "@/lib/blog/actions";
import type { BlogPostDetail, BlogPostRevision } from "@/lib/blog/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

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
        "inline-flex size-8 items-center justify-center rounded-md border border-border/80 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function BlogPostEditor({
  post,
  revisions = [],
}: {
  post?: BlogPostDetail;
  revisions?: BlogPostRevision[];
}) {
  const isEditing = Boolean(post);
  const editorPost = post ?? {
    id: "new",
    title: "",
    slug: "",
    excerpt: "",
    status: "draft",
    contentJson: EMPTY_DOC,
    contentHtml: "",
    coverImagePath: null,
    coverImageUrl: null,
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
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
    },
    onUpdate({ editor: activeEditor }) {
      setContentJson(JSON.stringify(activeEditor.getJSON()));
      setContentHtml(activeEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    setContentJson(JSON.stringify(editor.getJSON()));
    setContentHtml(editor.getHTML());
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
      setCoverImagePath(uploaded.path);
      setCoverImageUrl(uploaded.url);
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

  return (
    <form action={isEditing ? saveBlogPostAction : createBlogPostAction} className="space-y-8">
      {isEditing ? <input type="hidden" name="postId" value={editorPost.id} /> : null}
      <input type="hidden" name="contentJson" value={contentJson} />
      <input type="hidden" name="contentHtml" value={contentHtml} />
      <input type="hidden" name="coverImagePath" value={coverImagePath} />

      <section className="grid gap-5 rounded-xl border border-border/80 bg-muted/20 p-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={editorPost.title} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" defaultValue={editorPost.slug} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={editorPost.status}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="excerpt">Excerpt</Label>
            <textarea
              id="excerpt"
              name="excerpt"
              defaultValue={editorPost.excerpt}
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="space-y-2">
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
            />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Cover image</p>
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-border/80 bg-background">
            {coverImageUrl ? (
              <Image
                src={coverImageUrl}
                alt=""
                fill
                sizes="18rem"
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
            className="w-full"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploading}
          >
            Upload cover
          </Button>
          {uploadError ? (
            <p className="text-sm text-destructive">{uploadError}</p>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border/80 bg-background">
        <div className="flex flex-wrap gap-1 border-b border-border/80 bg-muted/30 p-2">
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
        <div className="blog-editor">
          <EditorContent editor={editor} />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
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
              render={<Link href={`/dashboard/content/blog/${editorPost.id}/preview`} />}
            >
              Preview
            </Button>
          ) : null}
          <Button type="submit" name="intent" value="save" variant="outline">
            <SaveIcon className="size-4" />
            Save draft
          </Button>
          <Button type="submit" name="intent" value="schedule" variant="outline">
            Schedule
          </Button>
          <Button type="submit" name="intent" value="publish">
            <SendIcon className="size-4" />
            Publish
          </Button>
          {isEditing ? (
            <>
              <Button type="submit" name="intent" value="archive" variant="outline">
                Archive
              </Button>
              {editorPost.deletedAt ? (
                <Button type="submit" name="intent" value="restore" variant="outline">
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

      {revisions.length > 0 ? (
        <section className="rounded-xl border border-border/80 bg-background p-5">
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
