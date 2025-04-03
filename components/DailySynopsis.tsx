"use client";

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
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

const colors = {
  "soft-blue": "bg-blue-50 border-blue-200",
  "soft-green": "bg-green-50 border-green-200",
  "soft-yellow": "bg-yellow-50 border-yellow-200",
  "soft-purple": "bg-purple-50 border-purple-200",
  "soft-pink": "bg-pink-50 border-pink-200",
  "soft-gray": "bg-gray-50 border-gray-200",
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
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const start = yesterday.toISOString().split("T")[0] + "T00:00:00Z";
  const end = yesterday.toISOString().split("T")[0] + "T23:59:59Z";

  const yesterdayReminders = reminders.filter(
    (r) => r.created_at >= start && r.created_at <= end && !r.is_archived
  );

  if (yesterdayReminders.length === 0) {
    return null;
  }

  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Yesterday's Entries</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {yesterdayReminders.map((reminder) => (
          <Card
            key={reminder.id}
            className={`${colors[reminder.color as keyof typeof colors]} ${reminder.is_done ? "opacity-50" : ""} rounded-sm`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 truncate">
                {reminder.title} {reminder.energy_scale ? `[${reminder.energy_scale}]` : ""}
                {reminder.need_to_do && <Badge variant="destructive">Need</Badge>}
                {reminder.want_to_do && <Badge variant="secondary">Want</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {reminder.content && (
                <p className="text-sm mb-2 truncate">{reminder.content}</p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDone(reminder.id, reminder.is_done)}
                  className="rounded-sm"
                >
                  {reminder.is_done ? "Undo" : "Done"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onArchive(reminder.id)}
                  className="rounded-sm"
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