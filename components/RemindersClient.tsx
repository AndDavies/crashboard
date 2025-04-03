"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import QuickCapture from "@/components/QuickCapture";
import ReminderList from "@/components/ReminderList";
import DailySynopsis from "@/components/DailySynopsis";
import TrendInsights from "@/components/TrendInsights";
import MotivationWidget from "@/components/MotivationWidget";
import KeywordCloud from "@/components/KeywordCloud";
import EnergyTrends from "@/components/EnergyTrends";
import TagUsage from "@/components/TagUsage";
import TimeOfDayActivity from "@/components/TimeOfDayActivity";
import MoodCorrelation from "@/components/MoodCorrelation";
import { Button } from "@/components/ui/button";

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

export default function RemindersClient({ initialReminders }: { initialReminders: Reminder[] }) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [showArchived, setShowArchived] = useState(false);
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
    <div className="container mx-auto p-4">
      <QuickCapture onSave={fetchReminders} />
      <div className="flex justify-end mt-4">
        <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Show Active" : "View Archived"}
        </Button>
      </div>
      {!showArchived && (
        <>
          <DailySynopsis reminders={reminders} />
          <MotivationWidget reminders={reminders} />
          <ReminderList reminders={reminders} showArchived={showArchived} />
          <EnergyTrends reminders={reminders} />
          <TagUsage reminders={reminders} />
          <TimeOfDayActivity reminders={reminders} />
          <MoodCorrelation reminders={reminders} />
          <TrendInsights reminders={reminders} />
          <KeywordCloud reminders={reminders} />
        </>
      )}
      {showArchived && <ReminderList reminders={reminders} showArchived={showArchived} />}
    </div>
  );
}