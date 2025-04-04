"use client";

import { useState, useEffect } from "react";
import ReminderTaskList from "@/components/ReminderTaskList";

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

export default function TodayReminders({
  reminders,
  onDone,
  onArchive,
}: {
  reminders: Reminder[];
  onDone: (id: string, currentDone: boolean) => void;
  onArchive: (id: string) => void;
}) {
  const [todayReminders, setTodayReminders] = useState<Reminder[]>([]);
  
  useEffect(() => {
    if (!Array.isArray(reminders)) {
      console.error("Reminders is not an array:", reminders);
      setTodayReminders([]);
      return;
    }
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    
    try {
      const filtered = reminders.filter(
        (r) => new Date(r.created_at) >= new Date(startOfDay) && !r.is_archived
      );
      setTodayReminders(filtered);
    } catch (err) {
      console.error("Error filtering today's reminders:", err);
      setTodayReminders([]);
    }
  }, [reminders]);

  return (
    <ReminderTaskList
      reminders={todayReminders}
      onDone={onDone}
      onArchive={onArchive}
      title="Today's Reminders"
      emptyMessage="No reminders added today. Add one above!"
    />
  );
} 