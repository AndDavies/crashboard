"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  color: string;
  need_to_do: boolean;
  want_to_do: boolean;
  reading_list: boolean;
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

const colors = {
  "soft-blue": "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 shadow-md hover:shadow-lg transition-all",
  "soft-green": "bg-gradient-to-br from-green-50 to-green-100 border-green-300 shadow-md hover:shadow-lg transition-all",
  "soft-yellow": "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300 shadow-md hover:shadow-lg transition-all",
  "soft-purple": "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 shadow-md hover:shadow-lg transition-all",
  "soft-pink": "bg-gradient-to-br from-pink-50 to-pink-100 border-pink-300 shadow-md hover:shadow-lg transition-all",
  "soft-gray": "bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300 shadow-md hover:shadow-lg transition-all",
};

export default function DailySynopsis({
  reminders,
  onDone,
  onArchive,
}: {
  reminders: Reminder[];
  onDone: (id: string, currentDone: boolean) => void;
  onArchive: (id: string) => void;
}) {
  const [yesterdayReminders, setYesterdayReminders] = useState<Reminder[]>([]);
  
  useEffect(() => {
    if (!Array.isArray(reminders)) {
      console.error("Reminders is not an array:", reminders);
      setYesterdayReminders([]);
      return;
    }
    
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const start = yesterday.toISOString().split("T")[0] + "T00:00:00Z";
      const end = yesterday.toISOString().split("T")[0] + "T23:59:59Z";
    
      const filtered = reminders.filter(
        (r) => r.created_at >= start && r.created_at <= end && !r.is_archived
      );
      
      setYesterdayReminders(filtered);
    } catch (err) {
      console.error("Error filtering yesterday's reminders:", err);
      setYesterdayReminders([]);
    }
  }, [reminders]);

  if (yesterdayReminders.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 mb-8">
      <h2 className="text-xl font-semibold mb-4">Yesterday's Reminders</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {yesterdayReminders.map((reminder) => (
          <Card
            key={reminder.id}
            className={`${colors[reminder.color as keyof typeof colors] || colors["soft-gray"]} ${
              reminder.is_done ? "opacity-60" : ""
            } rounded-lg border transform hover:-translate-y-1 duration-200`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 truncate">
                {reminder.title} 
                {reminder.energy_scale ? (
                  <span className="text-sm px-2 py-1 bg-gray-200 dark:bg-gray-800 rounded-full">
                    {reminder.energy_scale}
                  </span>
                ) : null}
                <div className="flex ml-auto gap-1">
                  {reminder.need_to_do && <Badge variant="destructive">Need</Badge>}
                  {reminder.want_to_do && <Badge variant="secondary">Want</Badge>}
                  {reminder.reading_list && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-800">
                      📚
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {reminder.content && (
                <p className="text-sm mb-3 truncate">{reminder.content}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant={reminder.is_done ? "outline" : "default"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDone(reminder.id, reminder.is_done);
                  }}
                  className="rounded-md shadow-sm hover:shadow transition-all"
                >
                  {reminder.is_done ? "Undo" : "Done"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(reminder.id);
                  }}
                  className="rounded-md shadow-sm hover:shadow transition-all"
                >
                  Archive
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}