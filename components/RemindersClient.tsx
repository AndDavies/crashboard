"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import QuickCapture from "@/components/QuickCapture";
import ReminderTaskList from "@/components/ReminderTaskList";
import DailySynopsis from "@/components/DailySynopsis";
import TodayReminders from "@/components/TodayReminders";
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
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders || []);
  const [showArchived, setShowArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const { toast } = useToast();

  const fetchReminders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) {
        console.error("Fetch error:", error);
        setError(error.message);
        toast({ title: "Error", description: "Failed to load reminders", variant: "destructive" });
      } else {
        setReminders(data || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddReminder = async (reminderData: Omit<Reminder, "id" | "created_at" | "is_archived" | "is_done">) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
        console.error("Auth error:", userError);
        return;
      }
      
      // Extract tags from content if any
      const tags = reminderData.content 
        ? extractTags(reminderData.content) 
        : [];
      
      const { error } = await supabase.from("reminders").insert({
        ...reminderData,
        tags,
        user_id: user.id,
      });
      
      if (error) {
        console.error("Save error:", error);
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Saved", description: "Reminder added" });
      }
    } catch (err) {
      console.error("Add reminder error:", err);
      toast({ title: "Error", description: "Failed to add reminder", variant: "destructive" });
    }
  };
  
  const extractTags = (text: string) => {
    const tagRegex = /#(\w+)/g;
    const matches = [...text.matchAll(tagRegex)];
    return matches.map((match) => match[1]);
  };

  const handleArchive = async (id: string) => {
    try {
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
    } catch (err) {
      console.error("Archive error:", err);
      toast({ title: "Error", description: "Failed to archive reminder", variant: "destructive" });
      await fetchReminders();
    }
  };

  const handleDone = async (id: string, currentDone: boolean) => {
    try {
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
    } catch (err) {
      console.error("Done status error:", err);
      toast({ title: "Error", description: "Failed to update reminder status", variant: "destructive" });
      await fetchReminders();
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

  // Calculate active and archived reminders safely
  const activeReminders = Array.isArray(reminders) 
    ? reminders.filter((r) => !r.is_archived)
    : [];
  
  const archivedReminders = Array.isArray(reminders)
    ? reminders.filter((r) => r.is_archived)
    : [];
    
  // Filter out today's reminders for the previous reminders list
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  
  const previousReminders = activeReminders.filter(
    (r) => new Date(r.created_at) < new Date(startOfDay)
  );

  // If there's an error, display it
  if (error) {
    return (
      <div className="container mx-auto p-6 bg-gradient-to-b from-gray-50 to-white min-h-screen">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
          <h2 className="text-xl font-bold text-red-700 mb-2">Error Loading Reminders</h2>
          <p className="text-red-600">{error}</p>
          <Button onClick={fetchReminders} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-screen">
      <QuickCapture onAddReminder={handleAddReminder} />
      
      {/* Loading indicator */}
      {isLoading && (
        <div className="text-center py-4">
          <p className="text-gray-500 dark:text-gray-400">Loading reminders...</p>
        </div>
      )}
      
      {/* Show Today's Reminders directly after the form */}
      {!showArchived && <TodayReminders 
        reminders={activeReminders} 
        onDone={handleDone} 
        onArchive={handleArchive} 
      />}
      
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          onClick={() => setShowArchived(!showArchived)} 
          className="rounded-md shadow hover:shadow-md transition-all"
        >
          {showArchived ? "Show Active" : "View Archived"}
        </Button>
      </div>
      
      {!showArchived && (
        <>
          <DailySynopsis reminders={activeReminders} onDone={handleDone} onArchive={handleArchive} />
          <ReminderTaskList 
            reminders={previousReminders} 
            onDone={handleDone} 
            onArchive={handleArchive}
            title="Previous Reminders"
            emptyMessage="No previous reminders found."
          />
          
          <h2 className="text-xl font-semibold mt-12 mb-6">Insights & Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <MotivationWidget reminders={activeReminders} />
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
        <ReminderTaskList 
          reminders={archivedReminders} 
          onDone={handleDone} 
          onArchive={handleArchive}
          title="Archived Reminders"
          emptyMessage="No archived reminders found."
        />
      )}
    </div>
  );
}