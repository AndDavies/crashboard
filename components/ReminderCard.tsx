"use client";

import { useState } from "react";
import { supabaseBlog } from '@/utils/supabase/supabaseBlogClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
};

export default function ReminderCard({ reminder }: { reminder: Reminder }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    const { error } = await supabaseBlog.from("reminders").delete().eq("id", reminder.id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete reminder", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Reminder removed" });
    }
  };

  const handlePin = async () => {
    const { error } = await supabaseBlog
      .from("reminders")
      .update({ is_pinned: !reminder.is_pinned })
      .eq("id", reminder.id);
    if (error) {
      toast({ title: "Error", description: "Failed to pin reminder", variant: "destructive" });
    } else {
      toast({ title: reminder.is_pinned ? "Unpinned" : "Pinned", description: "Reminder updated" });
    }
  };

  return (
    <Card
      className={`cursor-pointer ${reminder.is_pinned ? "border-yellow-400" : ""}`}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <CardHeader>
        <CardTitle className="text-lg">{reminder.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 truncate">
          {reminder.content || "No content"}
        </p>
        {isExpanded && (
          <>
            <p className="mt-2">{reminder.content}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {reminder.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  #{tag}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(reminder.created_at).toLocaleString()}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePin}>
                {reminder.is_pinned ? "Unpin" : "Pin"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}