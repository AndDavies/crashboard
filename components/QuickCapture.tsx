"use client";

import { useState, useEffect } from "react";
import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export default function QuickCapture() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const { toast } = useToast();

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }

    const { error } = await supabaseBlog.from("reminders").insert({
      title,
      content,
      tags: extractTags(content), // Simple tag extraction
      user_id: (await supabaseBlog.auth.getUser()).data.user?.id,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to save reminder", variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Reminder added successfully" });
      setTitle("");
      setContent("");
    }
  };

  const extractTags = (text: string) => {
    const tagRegex = /#(\w+)/g;
    const matches = [...text.matchAll(tagRegex)];
    return matches.map((match) => match[1]);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "Enter") handleSave();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [title, content]);

  return (
    <div className="mb-6 sticky top-0 z-10 bg-white p-4 rounded-md shadow">
      <Input
        placeholder="Jot something down..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-2"
      />
      <Textarea
        placeholder="Details, links, or thoughts..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="mb-2"
      />
      <Button onClick={handleSave}>Save (⌘ + Enter)</Button>
    </div>
  );
}