"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function QuickCapture({ onSave }: { onSave?: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  const handleSave = async () => {
    let finalTitle = title.trim();
    setIsLoading(true);

    if (!finalTitle && content.trim()) {
      if (/^https?:\/\//.test(content.trim())) {
        try {
          const res = await fetch("/api/fetch-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: content.trim() }),
          });
          const { title: fetchedTitle } = await res.json();
          finalTitle = fetchedTitle;
        } catch (error) {
          console.error("Title fetch error:", error);
          finalTitle = "Untitled";
          toast({ title: "Warning", description: "Couldn’t fetch title from URL", variant: "default" });
        }
      } else {
        finalTitle = "Untitled";
      }
    }
    if (!finalTitle) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      setIsLoading(false);
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
      console.error("Auth error:", userError);
      setIsLoading(false);
      return;
    }

    const colorOptions = ["soft-blue", "soft-green", "soft-yellow", "soft-purple", "soft-pink", "soft-gray"];
    const randomColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];

    const { error } = await supabase.from("reminders").insert({
      title: finalTitle,
      content,
      tags: extractTags(content),
      user_id: user.id,
      color: randomColor,
    });

    setIsLoading(false);
    if (error) {
      console.error("Save error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Reminder added" });
      setTitle("");
      setContent("");
      if (onSave) onSave();
    }
  };

  const extractTags = (text: string) => {
    const tagRegex = /#(\w+)/g;
    const matches = [...text.matchAll(tagRegex)];
    return matches.map((match) => match[1]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [title, content]);

  return (
    <div className="mb-6 sticky top-0 z-10 bg-white p-4 rounded-md shadow border border-gray-200">
      <Input
        placeholder="Jot something down..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-2"
        disabled={isLoading}
      />
      <Textarea
        placeholder="Details, links, or thoughts..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="mb-2"
        disabled={isLoading}
      />
      <Button onClick={handleSave} disabled={isLoading}>
        {isLoading ? "Saving..." : "Save (⌘ + Enter)"}
      </Button>
    </div>
  );
}