"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export default function QuickCapture({ onSave }: { onSave?: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [needToDo, setNeedToDo] = useState(false);
  const [wantToDo, setWantToDo] = useState(false);
  const [energyScale, setEnergyScale] = useState<string | null>(null);
  const [color, setColor] = useState("soft-gray"); // Default color
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

    const { error } = await supabase.from("reminders").insert({
      title: finalTitle,
      content,
      tags: extractTags(content),
      user_id: user.id,
      need_to_do: needToDo,
      want_to_do: wantToDo,
      energy_scale: energyScale ? Number.parseInt(energyScale) : null,
      color,
    });

    setIsLoading(false);
    if (error) {
      console.error("Save error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Reminder added" });
      setTitle("");
      setContent("");
      setNeedToDo(false);
      setWantToDo(false);
      setEnergyScale(null);
      setColor("soft-gray");
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
  }, [title, content, needToDo, wantToDo, energyScale, color]);

  return (
    <div className="mb-6 sticky top-0 z-10 bg-white p-4 rounded-md shadow border border-gray-200">
      <Input
        placeholder="Jot something down..."
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="mb-2 rounded-sm"
        disabled={isLoading}
      />
      <Textarea
        placeholder="Details, links, or thoughts..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="mb-2 rounded-sm resize-none"
        disabled={isLoading}
      />
      <div className="flex gap-4 mb-2">
        <Button
          variant={needToDo ? "default" : "outline"}
          onClick={() => setNeedToDo(!needToDo)}
          disabled={isLoading}
          className="rounded-sm"
        >
          Need To Do
        </Button>
        <Button
          variant={wantToDo ? "default" : "outline"}
          onClick={() => setWantToDo(!wantToDo)}
          disabled={isLoading}
          className="rounded-sm"
        >
          Want To Do
        </Button>
        <Select value={energyScale || ""} onValueChange={setEnergyScale} disabled={isLoading}>
          <SelectTrigger className="w-24 rounded-sm">
            <SelectValue placeholder="Energy" />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((num) => (
              <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={color} onValueChange={setColor} disabled={isLoading}>
          <SelectTrigger className="w-32 rounded-sm">
            <SelectValue placeholder="Color" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="soft-blue">Blue</SelectItem>
            <SelectItem value="soft-green">Green</SelectItem>
            <SelectItem value="soft-yellow">Yellow</SelectItem>
            <SelectItem value="soft-purple">Purple</SelectItem>
            <SelectItem value="soft-pink">Pink</SelectItem>
            <SelectItem value="soft-gray">Gray</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleSave} disabled={isLoading} className="rounded-sm">
        {isLoading ? "Saving..." : "Save (⌘ + Enter)"}
      </Button>
    </div>
  );
}