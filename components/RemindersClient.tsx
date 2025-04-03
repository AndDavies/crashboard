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
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const fetchReminders = async () => {
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error("Fetch error:", error);
    else setReminders(data || []);
  };

  const handleArchive = async (id: string) => {
    // Optimistic update
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, is_archived: true } : r)));
    
    const { error } = await supabase.from("reminders").update({ is_archived: true }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      // Rollback on error
      await fetchReminders();
    } else {
      toast({ title: "Archived", description: "Reminder archived" });
    }
  };

  const handleDone = async (id: string, currentDone: boolean) => {
    // Optimistic update
    setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, is_done: !currentDone } : r)));
    
    const { error } = await supabase.from("reminders").update({ is_done: !currentDone }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      // Rollback on error
      await fetchReminders();
    } else {
      toast({ title: currentDone ? "Undone" : "Done", description: "Reminder updated" });
    }
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

  const activeReminders = reminders.filter((r) => !r.is_archived);
  const archivedReminders = reminders.filter((r) => r.is_archived);

  return (
    <div className="container mx-auto p-4 bg-gray-50 min-h-screen">
      <QuickCapture onSave={fetchReminders} />
      <div className="flex justify-end mt-4">
        <Button variant="outline" onClick={() => setShowArchived(!showArchived)} className="rounded-md">
          {showArchived ? "Show Active" : "View Archived"}
        </Button>
      </div>
      {!showArchived && (
        <>
          <DailySynopsis reminders={activeReminders} onDone={handleDone} onArchive={handleArchive} />
          <MotivationWidget reminders={activeReminders} />
          <ReminderList reminders={activeReminders} showArchived={false} onDone={handleDone} onArchive={handleArchive} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <EnergyTrends reminders={activeReminders} />
            <TagUsage reminders={activeReminders} />
            <TimeOfDayActivity reminders={activeReminders} />
            <MoodCorrelation reminders={activeReminders} />
            <TrendInsights reminders={activeReminders} />
            <KeywordCloud reminders={activeReminders} />
          </div>
        </>
      )}
      {showArchived && (
        <ReminderList reminders={archivedReminders} showArchived={true} onDone={handleDone} onArchive={handleArchive} />
      )}
    </div>
  );
}