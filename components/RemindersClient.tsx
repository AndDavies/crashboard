"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import ReminderCard from "@/components/ReminderCard";
import QuickCapture from "@/components/QuickCapture";

type Reminder = {
  id: string;
  title: string;
  content: string | null;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  color: string; // Added color property
};

export default function RemindersClient({ initialReminders }: { initialReminders: Reminder[] }) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const supabase = createClient();

  const fetchReminders = async () => {
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error("Fetch error:", error);
    else setReminders(data || []);
  };

  useEffect(() => {
    const channel = supabase
      .channel("reminders")
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setReminders((prev) => [payload.new as Reminder, ...prev]);
        } else if (payload.eventType === "UPDATE") {
          setReminders((prev) =>
            prev.map((r) => (r.id === payload.new.id ? (payload.new as Reminder) : r))
          );
        } else if (payload.eventType === "DELETE") {
          setReminders((prev) => prev.filter((r) => r.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <>
      <QuickCapture onSave={fetchReminders} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reminders.length > 0 ? (
          reminders.map((reminder) => (
            <ReminderCard key={reminder.id} reminder={reminder} />
          ))
        ) : (
          <p className="text-gray-500">No reminders yet. Add one above!</p>
        )}
      </div>
    </>
  );
}