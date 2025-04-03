"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
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
  color: string;
};

const colors = {
  "soft-blue": "bg-blue-100",
  "soft-green": "bg-green-100",
  "soft-yellow": "bg-yellow-100",
  "soft-purple": "bg-purple-100",
  "soft-pink": "bg-pink-100",
  "soft-gray": "bg-gray-100",
};

export default function ReminderCard({ reminder }: { reminder: Reminder }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  console.log("Reminder color:", reminder.color); // Debug

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("reminders").delete().eq("id", reminder.id);
    if (error) {
      console.error("Delete error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Reminder removed" });
    }
  };

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from("reminders")
      .update({txtis_pinned: !reminder.is_pinned })
      .eq("id", reminder.id);
    if (error) {
      console.error("Pin error:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: reminder.is_pinned ? "Unpinned" : "Pinned", description: "Reminder updated" });
    }
  };

  const colorClass = colors[reminder.color as keyof typeof colors] || colors["soft-gray"];

  return (
    <Card
      className={`cursor-pointer ${colorClass} ${reminder.is_pinned ? "border-yellow-400 border-2" : ""}`}
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