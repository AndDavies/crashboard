"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import ReminderDetailPanel from "@/components/ReminderDetailPanel";

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
  "soft-blue": "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-300 dark:from-blue-950 dark:to-blue-900 dark:border-blue-800 dark:text-blue-100",
  "soft-green": "bg-gradient-to-br from-green-50 to-green-100 border-green-300 dark:from-green-950 dark:to-green-900 dark:border-green-800 dark:text-green-100",
  "soft-yellow": "bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300 dark:from-yellow-950 dark:to-yellow-900 dark:border-yellow-800 dark:text-yellow-100",
  "soft-purple": "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-300 dark:from-purple-950 dark:to-purple-900 dark:border-purple-800 dark:text-purple-100",
  "soft-pink": "bg-gradient-to-br from-pink-50 to-pink-100 border-pink-300 dark:from-pink-950 dark:to-pink-900 dark:border-pink-800 dark:text-pink-100",
  "soft-gray": "bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300 dark:from-gray-900 dark:to-gray-800 dark:border-gray-700 dark:text-gray-100",
};

export default function ReminderList({
  reminders,
  onDone,
  onArchive,
  title,
  emptyMessage,
}: {
  reminders: Reminder[];
  onDone: (id: string, currentDone: boolean) => void;
  onArchive: (id: string) => void;
  title: string;
  emptyMessage: string;
}) {
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const handleReminderClick = (reminder: Reminder) => {
    setSelectedReminder(reminder);
    setIsDetailOpen(true);
  };

  const handleDetailClose = () => {
    setIsDetailOpen(false);
  };

  const handleDone = (id: string, currentDone: boolean) => {
    onDone(id, currentDone);
    // Update the selected reminder if it's the one that was updated
    if (selectedReminder && selectedReminder.id === id) {
      setSelectedReminder({
        ...selectedReminder,
        is_done: !currentDone
      });
    }
  };

  const handleArchive = (id: string) => {
    onArchive(id);
    // Close the detail panel if the archived reminder was selected
    if (selectedReminder && selectedReminder.id === id) {
      setIsDetailOpen(false);
    }
  };

  return (
    <div className="mt-6 mb-8">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      
      {reminders.length === 0 ? (
        <div className="text-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg shadow-sm dark:from-gray-900 dark:to-gray-800 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {reminders.map((reminder) => (
            <Card
              key={reminder.id}
              className={`${colors[reminder.color as keyof typeof colors] || colors["soft-gray"]} ${
                reminder.is_done ? "opacity-60" : ""
              } shadow-md hover:shadow-lg rounded-lg border transform hover:-translate-y-1 duration-200 cursor-pointer transition-all`}
              onClick={() => handleReminderClick(reminder)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2 truncate">
                  {reminder.title}
                  {reminder.energy_scale ? (
                    <span className="text-sm px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full">
                      {reminder.energy_scale}
                    </span>
                  ) : null}
                  <div className="flex ml-auto gap-1">
                    {reminder.need_to_do && <Badge variant="destructive">Need</Badge>}
                    {reminder.want_to_do && <Badge variant="secondary">Want</Badge>}
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
                      handleDone(reminder.id, reminder.is_done);
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
                      handleArchive(reminder.id);
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
      )}
      
      {/* Detail Panel */}
      {selectedReminder && (
        <ReminderDetailPanel
          reminder={selectedReminder}
          isOpen={isDetailOpen}
          onClose={handleDetailClose}
          onDone={handleDone}
          onArchive={handleArchive}
        />
      )}
    </div>
  );
}