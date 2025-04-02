"use client";

import React, { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { CustomStyle, KeyTakeaways } from "@/lib/tiptap-extensions";
import { useRouter } from "next/navigation";
import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table as UITable, TableBody as UITableBody, TableCell as UITableCell, TableHead as UITableHead, TableHeader as UITableHeader, TableRow as UITableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import Spinner from "./Spinner";
import dynamic from "next/dynamic";
import { toast } from "react-hot-toast";
import { TagOption } from "./TagInput";
import imageCompression from 'browser-image-compression';

interface TagInputProps {
  value: TagOption[];
  onChange: (tags: TagOption[]) => void;
}

const TagInput = dynamic(() => import("./TagInput"), { ssr: false }) as React.ComponentType<TagInputProps>;

export interface BlogPost {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  published_at: string | null;
  author_id: string | null;
  tags: string[];
  featured_image: string | null;
  is_published: boolean;
  is_featured: boolean;
  meta_description: string;
}

interface BlogEditorProps {
  initialData?: BlogPost;
  onSaveComplete?: () => void;
}

interface ImageOption {
  name: string;
  url: string;
}

const PREDEFINED_TAGS: TagOption[] = [
  "pet travel", "dog friendly", "rabies", "travel tips", "nomadic living", "vet advice", "countries", "airlines", "hotels"
].map(tag => ({ value: tag, label: tag }));

const MenuBar: React.FC<{ editor: any; onSelectImage: (url: string) => void }> = ({ editor, onSelectImage }) => {
  const [images, setImages] = useState<ImageOption[]>([]);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);

  useEffect(() => {
    async function fetchImages() {
      const { data, error } = await supabaseBlog.storage.from("images").list();
      if (error) {
        toast.error("Failed to load images: " + error.message);
      } else {
        const imageList = data.map((file) => ({
          name: file.name,
          url: supabaseBlog.storage.from("images").getPublicUrl(file.name).data.publicUrl,
        }));
        setImages(imageList);
      }
    }
    fetchImages();
  }, []);

  if (!editor) return null;
  return (
    <div className="absolute top-2 left-2 right-2 z-10 bg-white border-b border-muted p-2 overflow-x-auto whitespace-nowrap shadow-md">
      <div className="flex gap-2">
        <Button variant={editor.isActive("bold") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </Button>
        <Button variant={editor.isActive("italic") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleItalic().run()}>
          Italic
        </Button>
        <Button variant={editor.isActive("underline") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          Underline
        </Button>
        <Button variant={editor.isActive("strike") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleStrike().run()}>
          Strike
        </Button>
        <Button variant="outline" size="sm" onClick={() => editor.chain().focus().setParagraph().run()}>
          Paragraph
        </Button>
        <Button variant={editor.isActive("heading", { level: 1 }) ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </Button>
        <Button variant={editor.isActive("heading", { level: 2 }) ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </Button>
        <Button variant={editor.isActive("heading", { level: 3 }) ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </Button>
        <Button variant={editor.isActive("bulletList") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          Bullet List
        </Button>
        <Button variant={editor.isActive("orderedList") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          Ordered List
        </Button>
        <Button variant={editor.isActive("blockquote") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          Blockquote
        </Button>
        <Button variant={editor.isActive("codeBlock") ? "default" : "outline"} size="sm" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          Code Block
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const url = window.prompt("Enter URL", editor.getAttributes("link").href || "");
            if (url) editor.chain().focus().setLink({ href: url }).run();
            else if (url === "") editor.chain().focus().unsetLink().run();
          }}
        >
          Link
        </Button>
        <Button variant="outline" size="sm" onClick={() => editor.chain().focus().unsetLink().run()}>
          Unset Link
        </Button>
        <Button
          variant={editor.isActive("customStyle", { class: "bg-yellow-200" }) ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleCustomStyle("bg-yellow-200").run()}
        >
          Yellow Highlight
        </Button>
        <Button
          variant={editor.isActive("customStyle", { class: "key-takeaways-highlight" }) ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleCustomStyle("key-takeaways-highlight").run()}
        >
          Takeaway Highlight
        </Button>
        <Button variant="outline" size="sm" onClick={() => editor.chain().focus().insertKeyTakeaways().run()}>
          Insert Key Takeaways
        </Button>
        <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">Select Image</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select an Image</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
              {images.map((img) => (
                <div key={img.name} className="cursor-pointer" onClick={() => { onSelectImage(img.url); setImageDialogOpen(false); }}>
                  <img src={img.url} alt={img.name} className="w-full h-24 object-cover rounded" />
                  <p className="text-sm truncate">{img.name}</p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

const BlogEditor: React.FC<BlogEditorProps> = ({ initialData, onSaveComplete }) => {
  const router = useRouter();

  const [title, setTitle] = useState<string>(initialData?.title || "");
  const [slug, setSlug] = useState<string>(initialData?.slug || "");
  const [excerpt, setExcerpt] = useState<string>(initialData?.excerpt || "");
  const [metaDescription, setMetaDescription] = useState<string>(initialData?.meta_description || "");
  const [publishedAt, setPublishedAt] = useState<string>(
    initialData?.published_at ? new Date(initialData.published_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [authorId, setAuthorId] = useState<string>(initialData?.author_id || "");
  const [authors, setAuthors] = useState<Array<{ id: string; name: string }>>([]);
  const [authorsLoading, setAuthorsLoading] = useState<boolean>(true);
  const [selectedTags, setSelectedTags] = useState<TagOption[]>(
    initialData?.tags ? initialData.tags.map((tag) => ({ value: tag, label: tag })) : []
  );
  const [featuredImage, setFeaturedImage] = useState<string>(initialData?.featured_image || "");
  const [isPublished, setIsPublished] = useState<boolean>(initialData?.is_published || false);
  const [isFeatured, setIsFeatured] = useState<boolean>(initialData?.is_featured || false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [images, setImages] = useState<ImageOption[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Underline,
      Link.configure({ openOnClick: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      CustomStyle,
      KeyTakeaways,
    ],
    content: initialData?.content || "<p>Start writing your article...</p>",
    onSelectionUpdate: ({ editor }) => {
      const { from } = editor.state.selection;
      const link = editor.getAttributes("link");
      if (link.href && editor.isActive("link")) {
        const url = window.prompt("Edit URL", link.href);
        if (url === null) return;
        if (url === "") editor.chain().focus().unsetLink().run();
        else editor.chain().focus().setLink({ href: url }).run();
      }
    },
  });

  useEffect(() => {
    async function fetchAuthors() {
      setAuthorsLoading(true);
      const { data, error } = await supabaseBlog.from("authors").select("id, name");
      if (error) toast.error("Failed to load authors");
      else if (data) setAuthors(data);
      setAuthorsLoading(false);
    }
    async function fetchImages() {
      const { data, error } = await supabaseBlog.storage.from("images").list();
      if (error) toast.error("Failed to load images: " + error.message);
      else {
        const imageList = data.map((file) => ({
          name: file.name,
          url: supabaseBlog.storage.from("images").getPublicUrl(file.name).data.publicUrl,
        }));
        setImages(imageList);
      }
    }
    fetchAuthors();
    fetchImages();

    // Autosave to Supabase every 30 seconds
    const autosaveInterval = setInterval(() => {
      handleAutosave();
    }, 30000);
    return () => clearInterval(autosaveInterval);
  }, [title, slug, excerpt, editor, selectedTags, featuredImage, publishedAt, authorId, isPublished, isFeatured, metaDescription]);

  useEffect(() => {
    if (!initialData && title && !slug) {
      checkSlugUniqueness(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
    }
  }, [title, slug, initialData]);

  const handleAutosave = async () => {
    if (!editor || saving) return;
    const draft: BlogPost = {
      title,
      slug,
      excerpt,
      content: editor.getHTML(),
      published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
      author_id: authorId,
      tags: selectedTags.map(tag => tag.value),
      featured_image: featuredImage,
      is_published: isPublished,
      is_featured: isFeatured,
      meta_description: metaDescription,
    };
    const { error } = await supabaseBlog.from("blog_posts").upsert(draft, { onConflict: 'id' });
    if (error) console.error("Autosave failed:", error.message);
    else console.log("Autosaved draft");
  };

  const checkSlugUniqueness = async (baseSlug: string) => {
    let newSlug = baseSlug;
    let counter = 1;
    while (true) {
      const { data } = await supabaseBlog.from('blog_posts').select('slug').eq('slug', newSlug).single();
      if (!data) break;
      newSlug = `${baseSlug}-${counter++}`;
    }
    setSlug(newSlug);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    setSaving(true);
    const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1200 };
    const compressedFile = await imageCompression(file, options);
    const fileName = `${Date.now()}_${file.name}`;
    const { error } = await supabaseBlog.storage.from("images").upload(fileName, compressedFile);
    if (error) {
      toast.error("Image upload failed: " + error.message);
    } else {
      const { data: { publicUrl } } = supabaseBlog.storage.from("images").getPublicUrl(fileName);
      if (publicUrl) {
        editor.chain().focus().setImage({ src: publicUrl }).run();
        setImages((prev) => [...prev, { name: fileName, url: publicUrl }]);
        toast.success("Image uploaded successfully");
      }
    }
    setSaving(false);
  };

  const handleFeaturedImageUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    const options = { maxSizeMB: 0.2, maxWidthOrHeight: 1600 };
    const compressedFile = await imageCompression(file, options);
    const fileName = `${Date.now()}_${file.name}`;
    const { error } = await supabaseBlog.storage.from("images").upload(fileName, compressedFile);
    if (error) {
      toast.error("Featured image upload failed: " + error.message);
    } else {
      const { data: { publicUrl } } = supabaseBlog.storage.from("images").getPublicUrl(fileName);
      if (publicUrl) {
        setFeaturedImage(publicUrl);
        setImages((prev) => [...prev, { name: fileName, url: publicUrl }]);
        toast.success("Featured image uploaded");
      }
    }
    setSaving(false);
  };

  const removeFeaturedImage = () => {
    setFeaturedImage("");
    toast.success("Featured image removed");
  };

  const handleSelectImage = (url: string) => {
    if (editor) {
      editor.chain().focus().setImage({ src: url }).run();
      toast.success("Image added to content");
    }
  };

  const handleSelectFeaturedImage = (url: string) => {
    setFeaturedImage(url);
    setImageDialogOpen(false);
    toast.success("Featured image selected");
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "Title is required";
    if (!slug.trim()) newErrors.slug = "Slug is required";
    if (!excerpt.trim()) newErrors.excerpt = "Excerpt is required";
    if (!metaDescription.trim()) newErrors.metaDescription = "Meta description is required";
    if (!publishedAt) newErrors.publishedAt = "Published date is required";
    if (!authorId) newErrors.authorId = "Author is required";
    if (selectedTags.length === 0) newErrors.tags = "At least one tag is required";
    if (!featuredImage) newErrors.featuredImage = "Featured image is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSavePost = async (): Promise<void> => {
    if (!editor || !validateForm()) {
      toast.error("Please fix all errors before saving");
      return;
    }
    setSaving(true);
    const tagsArray = selectedTags.map((tag) => tag.value);

    const blogPost: BlogPost = {
      title,
      slug,
      excerpt,
      content: editor.getHTML(),
      published_at: publishedAt ? new Date(publishedAt).toISOString() : null,
      author_id: authorId,
      tags: tagsArray,
      featured_image: featuredImage,
      is_published: isPublished,
      is_featured: isFeatured,
      meta_description: metaDescription,
    };

    let response;
    if (initialData?.id) {
      response = await supabaseBlog.from("blog_posts").update(blogPost).eq("id", initialData.id).select().single();
    } else {
      response = await supabaseBlog.from("blog_posts").insert([blogPost]).select().single();
    }

    if (response.error) {
      toast.error("Error saving post: " + response.error.message);
    } else {
      toast.success(`Post ${initialData?.id ? "updated" : "created"} successfully`);
      if (onSaveComplete) onSaveComplete();
      else router.push("/dashboard/blog");
    }
    setSaving(false);
  };

  return (
    <div className="w-full p-8 font-sans"> {/* Full width */}
      <div className="space-y-8">
        <h2 className="text-2xl font-bold mb-4">
          {initialData ? "Edit Blog Post" : "Create New Blog Post"}
        </h2>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold">Basic Information</h3>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              {errors.title && <p className="text-red-500 text-sm">{errors.title}</p>}
            </div>
            <div>
              <Label htmlFor="slug">Slug *</Label>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
              <p className="text-sm text-muted-foreground">Auto-generated from title unless edited.</p>
              {errors.slug && <p className="text-red-500 text-sm">{errors.slug}</p>}
            </div>
            <div>
              <Label htmlFor="excerpt">Excerpt * ({excerpt.length} Characters)</Label>
              <Textarea
                id="excerpt"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                className="w-full h-24 resize-none"
                required
              />
              {errors.excerpt && <p className="text-red-500 text-sm">{errors.excerpt}</p>}
            </div>
            <div>
              <Label htmlFor="metaDescription">Meta Description * ({metaDescription.length} Characters)</Label>
              <Textarea
                id="metaDescription"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
                className="w-full h-24 resize-none"
                required
              />
              <p className="text-sm text-muted-foreground">Recommended: 150-160 characters</p>
              {errors.metaDescription && <p className="text-red-500 text-sm">{errors.metaDescription}</p>}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold">Publication Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="publishedAt">Published At *</Label>
              <Input
                id="publishedAt"
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                required
              />
              {errors.publishedAt && <p className="text-red-500 text-sm">{errors.publishedAt}</p>}
            </div>
            <div>
              <Label htmlFor="authorId">Author *</Label>
              <Select value={authorId} onValueChange={setAuthorId} disabled={authorsLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={authorsLoading ? "Loading authors..." : "Select an author"} />
                </SelectTrigger>
                <SelectContent>
                  {authors.map((author) => (
                    <SelectItem key={author.id} value={author.id}>
                      {author.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.authorId && <p className="text-red-500 text-sm">{errors.authorId}</p>}
            </div>
            <div>
              <Label htmlFor="tags">Tags *</Label>
              <TagInput value={selectedTags} onChange={setSelectedTags} />
              {errors.tags && <p className="text-red-500 text-sm">{errors.tags}</p>}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPublished"
                checked={isPublished}
                onCheckedChange={(checked: boolean) => setIsPublished(checked)}
              />
              <Label htmlFor="isPublished">Published</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isFeatured"
                checked={isFeatured}
                onCheckedChange={(checked: boolean) => setIsFeatured(checked)}
              />
              <Label htmlFor="isFeatured">Featured</Label>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold">Featured Image *</h3>
          {featuredImage && (
            <div className="relative">
              <img src={featuredImage} alt="Featured" className="w-full rounded-md mb-2" />
              <Button variant="destructive" size="sm" onClick={removeFeaturedImage} className="absolute top-2 right-2">
                Remove
              </Button>
            </div>
          )}
          <div className="flex gap-2">
            <Button asChild disabled={saving}>
              <label htmlFor="featuredImage" className="cursor-pointer">
                {saving ? "Uploading..." : "Upload Image"}
              </label>
            </Button>
            <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">Select Existing Image</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Select a Featured Image</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                  {images.map((img) => (
                    <div key={img.name} className="cursor-pointer" onClick={() => handleSelectFeaturedImage(img.url)}>
                      <img src={img.url} alt={img.name} className="w-full h-24 object-cover rounded" />
                      <p className="text-sm truncate">{img.name}</p>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <input id="featuredImage" type="file" accept="image/*" onChange={handleFeaturedImageUpload} className="hidden" />
          </div>
          {errors.featuredImage && <p className="text-red-500 text-sm">{errors.featuredImage}</p>}
        </section>

        <section className="space-y-4">
          <h3 className="text-xl font-semibold">{showPreview ? "SEO Preview" : "Content"}</h3>
          <div className="flex gap-2 mb-4">
            <Button onClick={() => setShowPreview(false)} variant={!showPreview ? "default" : "outline"}>Editor</Button>
            <Button onClick={() => setShowPreview(true)} variant={showPreview ? "default" : "outline"}>SEO Preview</Button>
          </div>
          {showPreview ? (
            <div className="border border-muted rounded-md p-4">
              <p className="text-blue-600 text-lg">{title}</p>
              <p className="text-green-600 text-sm">https://findyourchimps.dev/blog/{slug}</p>
              <p className="text-gray-600 text-sm">{metaDescription}</p>
            </div>
          ) : (
            <div className="border border-muted rounded-md p-4 relative">
              <MenuBar editor={editor} onSelectImage={handleSelectImage} />
              <div className="min-h-[400px] prose prose-lg pt-12"> {/* Padding-top for floating MenuBar */}
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
          {!showPreview && (
            <Button asChild disabled={saving}>
              <label htmlFor="contentImage" className="cursor-pointer">
                {saving ? "Uploading..." : "Upload Image to Content"}
              </label>
            </Button>
          )}
          <input id="contentImage" type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
        </section>

        <section className="flex gap-4">
          <Button onClick={handleSavePost} className="flex-1" disabled={saving}>
            {saving ? <Spinner /> : "Save Post"}
          </Button>
          <Button variant="outline" onClick={() => setErrors({})}>Clear Errors</Button>
        </section>
      </div>
    </div>
  );
};

export default BlogEditor;