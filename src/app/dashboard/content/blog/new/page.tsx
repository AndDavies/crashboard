import type { Metadata } from "next";
import { createBlogPostAction } from "@/lib/blog/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "New blog post" };

export default function NewBlogPostPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <section>
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          CMS
        </p>
        <h2 className="mt-2 font-heading text-2xl font-semibold tracking-tight text-foreground">
          New blog post
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Create a draft first, then add rich text, images, and publishing details
          in the editor.
        </p>
      </section>

      <form action={createBlogPostAction} className="space-y-4 rounded-xl border border-border/80 bg-muted/20 p-5">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="Untitled post" />
        </div>
        <Button type="submit">Create draft</Button>
      </form>
    </div>
  );
}
