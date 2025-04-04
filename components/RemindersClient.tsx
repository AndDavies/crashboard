"use client";

import { useState, useEffect, useRef } from "react";
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
  reading_list?: boolean;
  is_archived: boolean;
  is_done: boolean;
  energy_scale: number | null;
};

// Make sure reading_list is always defined when sending to child components
type StrictReminder = Omit<Reminder, 'reading_list'> & { reading_list: boolean };

// Helper function to ensure reading_list is defined in arrays
const ensureReadingList = (reminders: Reminder[]): StrictReminder[] => {
  return reminders.map(reminder => ({
    ...reminder,
    reading_list: reminder.reading_list ?? false
  }));
};

export default function RemindersClient({ initialReminders }: { initialReminders: Reminder[] }) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders || []);
  const [showArchived, setShowArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeWorking, setIsRealtimeWorking] = useState<boolean | null>(null); // null = unknown, true/false = status
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
      console.log("Adding reminder with data:", reminderData);
      
      // Get the authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Auth error:", userError);
        toast({ title: "Authentication Error", description: "Please log in again to add reminders", variant: "destructive" });
        return;
      }
      
      if (!user || !user.id) {
        console.error("No user ID available - user:", user);
        toast({ title: "Error", description: "Cannot add reminder: User ID not available", variant: "destructive" });
        return;
      }
      
      console.log("User authenticated with ID:", user.id);
      
      // Extract additional tags from content if any
      let additionalTags: string[] = [];
      if (reminderData.content) {
        additionalTags = extractTags(reminderData.content);
      }
      
      // Combine form-provided tags with content-extracted tags, removing duplicates
      const allTags = [...new Set([...reminderData.tags, ...additionalTags])];
      
      // If title is empty but there's a URL in the content, try to generate a title
      let reminderTitle = reminderData.title;
      if (!reminderTitle && reminderData.content) {
        const urlMatch = reminderData.content.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          try {
            const response = await fetch('/api/generate-title', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                url: urlMatch[0],
                content: reminderData.content 
              }),
            });
            
            if (response.ok) {
              const { title } = await response.json();
              if (title) reminderTitle = title;
            }
          } catch (error) {
            console.error("Title generation error:", error);
            // Continue with empty title if generation fails
          }
        } else if (reminderData.content.trim()) {
          // If there's no URL but there is content, try to generate a title from the content
          try {
            const response = await fetch('/api/generate-title', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ content: reminderData.content }),
            });
            
            if (response.ok) {
              const { title } = await response.json();
              if (title) reminderTitle = title;
            }
          } catch (error) {
            console.error("Title generation error:", error);
            // Continue with empty title if generation fails
          }
        }
      }
      
      // Use an untitled placeholder if we still don't have a title
      if (!reminderTitle) {
        reminderTitle = "Untitled Reminder";
      }
      
      // Create an optimistic reminder to show immediately
      const optimisticReminder: Reminder = {
        id: `temp-${Date.now()}`, // Temporary ID
        title: reminderTitle,
        content: reminderData.content,
        tags: allTags,
        created_at: new Date().toISOString(),
        is_pinned: reminderData.is_pinned,
        color: reminderData.color,
        need_to_do: reminderData.need_to_do,
        want_to_do: reminderData.want_to_do,
        reading_list: reminderData.reading_list,
        is_archived: false,
        is_done: false,
        energy_scale: reminderData.energy_scale,
      };
      
      // Update the UI optimistically
      setReminders(prev => [optimisticReminder, ...prev]);
      
      // Prepare the payload for Supabase
      const payload: Record<string, any> = {
        title: reminderTitle,
        content: reminderData.content,
        tags: allTags,
        is_pinned: reminderData.is_pinned || false,
        color: reminderData.color || 'soft-blue',
        need_to_do: reminderData.need_to_do || false,
        want_to_do: reminderData.want_to_do || false,
        energy_scale: reminderData.energy_scale,
        user_id: user.id,
      };
      
      // First check if we can access the database schema to determine column existence
      try {
        // Attempt a small query first to check if the schema includes reading_list
        const schemaCheck = await supabase
          .from("reminders")
          .select("reading_list")
          .limit(1);
          
        // If there's no error, the column exists and we can include it
        if (!schemaCheck.error) {
          console.log("reading_list column exists, including it in payload");
          payload.reading_list = reminderData.reading_list || false;
        } else {
          console.log("reading_list column doesn't exist in schema, excluding it from payload");
          // Since column doesn't exist, we'll store the value in the UI but not send to database
          // This way UI works but database operations don't fail
        }
      } catch (schemaError) {
        console.error("Error checking schema:", schemaError);
        // If we can't determine schema, play it safe and exclude reading_list
      }
      
      // Verify user_id is included
      if (!payload.user_id) {
        console.error("USER ID MISSING IN PAYLOAD!");
        toast({ 
          title: "Error", 
          description: "Cannot save reminder: User ID is missing", 
          variant: "destructive" 
        });
        return;
      }
      
      console.log("Sending payload to Supabase:", JSON.stringify(payload, null, 2));
      
      // Attempt to insert the reminder with more detailed error handling
      try {
        const { data, error } = await supabase
          .from("reminders")
          .insert(payload)
          .select();
        
        if (error) {
          console.error("Save error:", error);
          console.error("Error details:", JSON.stringify(error, null, 2));
          
          // Show more specific error messages based on error code
          let errorMessage = error.message || "Failed to save reminder";
          
          if (error.code === "PGRST204" && error.message?.includes("reading_list")) {
            errorMessage = "The reading_list feature is not yet available in your database. Update your schema.";
          } else if (error.code) {
            switch (error.code) {
              case "23502": // not_null_violation
                errorMessage = "A required field is missing";
                break;
              case "23503": // foreign_key_violation
                errorMessage = "Invalid user reference";
                break;
              case "42P01": // undefined_table
                errorMessage = "Reminders table does not exist";
                break;
              default:
                errorMessage += ` (Code: ${error.code})`;
            }
          } else if (Object.keys(error).length === 0) {
            // Handle empty error object
            errorMessage = "Unknown database error occurred";
            console.error("Empty error object received from Supabase");
          }
          
          toast({ title: "Error", description: errorMessage, variant: "destructive" });
          
          // Remove the optimistic reminder if there's an error
          setReminders(prev => prev.filter(r => r.id !== optimisticReminder.id));
          
          // Fetch the latest data to ensure UI is in sync
          fetchReminders();
        } else {
          console.log("Reminder saved successfully:", data);
          toast({ title: "Saved", description: "Reminder added" });
          
          // If the realtime subscription isn't working properly, replace the optimistic reminder with the real one
          if (data && data.length > 0) {
            setReminders(prev => prev.map(r => 
              r.id === optimisticReminder.id ? data[0] : r
            ));
          }
        }
      } catch (insertErr) {
        console.error("Error during Supabase insert operation:", insertErr);
        toast({ 
          title: "Database Error", 
          description: "There was a problem saving your reminder. Please try again.", 
          variant: "destructive" 
        });
        
        // Remove the optimistic reminder if there's an error
        setReminders(prev => prev.filter(r => r.id !== optimisticReminder.id));
      }
      
      // Set a safety timeout to remove optimistic reminder if no server confirmation happens
      const optimisticTimeout = setTimeout(() => {
        // Check if the optimistic reminder is still in the list after 10 seconds
        setReminders(prev => {
          if (prev.some(r => r.id === optimisticReminder.id)) {
            console.warn("No server confirmation received for optimistic reminder, removing it");
            return prev.filter(r => r.id !== optimisticReminder.id);
          }
          return prev;
        });
      }, 10000); // 10 second timeout
      
      // Clean up timeout if component unmounts
      return () => clearTimeout(optimisticTimeout);
      
    } catch (err) {
      console.error("Add reminder error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      toast({ title: "Error", description: `Failed to add reminder: ${errorMessage}`, variant: "destructive" });
      // Fetch the latest data on error
      fetchReminders();
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

  // Setup polling as fallback for realtime
  const setupPolling = () => {
    console.log("Setting up polling mechanism as fallback...");
    
    // Clear any existing intervals
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    // Set up new interval for polling
    pollingIntervalRef.current = setInterval(() => {
      console.log("Polling for updates...");
      fetchReminders();
    }, 15000); // Poll every 15 seconds
  };
  
  // Stop polling when not needed
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      console.log("Stopping polling mechanism...");
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    // Fetch reminders when component mounts to ensure we have the latest data
    fetchReminders();
    
    // Check the Supabase API structure
    checkSupabaseStructure();
    
    console.log("Setting up realtime subscription to Supabase...");
    
    // Setup realtime subscription
    let channelSubscription: ReturnType<typeof supabase.channel> | null = null;
    let realtimeEnabled = false;
    
    // Set up polling as a fallback by default
    const defaultPollingId = setTimeout(() => {
      // If realtime hasn't been confirmed working by this point, start polling
      if (!realtimeEnabled) {
        console.log("No confirmation of realtime within timeout, starting polling as precaution");
        setIsRealtimeWorking(false);
        setupPolling();
      }
    }, 5000); // Give a shorter window to ensure we don't miss updates
    
    try {
      // Create channel with error handler
      let channel;
      try {
        channel = supabase.channel("reminders-changes", {
          config: {
            broadcast: { self: true }
          }
        });
      } catch (channelError) {
        console.error("Failed to create channel:", channelError);
        setIsRealtimeWorking(false);
        setupPolling();
        return () => {
          clearTimeout(defaultPollingId);
          stopPolling();
        };
      }
      
      if (!channel) {
        console.error("Channel creation returned undefined/null");
        setIsRealtimeWorking(false);
        setupPolling();
        return () => {
          clearTimeout(defaultPollingId);
          stopPolling();
        };
      }
      
      // Try to set up event listeners
      try {
        channel.on("postgres_changes", 
          { event: "*", schema: "public", table: "reminders" }, 
          (payload) => {
            console.log("Realtime event received:", payload.eventType, payload);
            // Mark realtime as working when we receive an event
            setIsRealtimeWorking(true);
            realtimeEnabled = true;
            
            // Stop polling if realtime is working
            stopPolling();
            
            if (payload.eventType === "INSERT") {
              setReminders((prev) => {
                // Check if we already have an optimistic version of this reminder
                const tempId = `temp-${Date.now()}`.substring(0, 10); // Match just the prefix
                const hasOptimisticVersion = prev.some(r => 
                  r.id.toString().startsWith('temp-') && 
                  r.title === (payload.new as Reminder).title
                );
                
                if (hasOptimisticVersion) {
                  // Replace the optimistic version with the real one
                  return prev.map(r => 
                    r.id.toString().startsWith('temp-') && r.title === (payload.new as Reminder).title 
                      ? (payload.new as Reminder) 
                      : r
                  );
                } else {
                  // It's a new reminder, add it to the list
                  return [payload.new as Reminder, ...prev];
                }
              });
            } else if (payload.eventType === "UPDATE") {
              setReminders((prev) =>
                prev.map((r) => (r.id === payload.new.id ? (payload.new as Reminder) : r))
              );
            } else if (payload.eventType === "DELETE") {
              setReminders((prev) => prev.filter((r) => r.id !== payload.old.id));
            }
          }
        );
      } catch (listenerError) {
        console.error("Failed to add event listener to channel:", listenerError);
        setIsRealtimeWorking(false);
        setupPolling();
        return () => {
          clearTimeout(defaultPollingId);
          stopPolling();
        };
      }
        
      // Subscribe to the channel and store the reference
      channelSubscription = channel;
      
      // Try to subscribe
      try {
        channel.subscribe((status) => {
          console.log("Subscription status:", status);
          if (status === "SUBSCRIBED") {
            console.log("Successfully subscribed to realtime updates!");
            realtimeEnabled = true;
            setIsRealtimeWorking(true);
            clearTimeout(defaultPollingId);
            
            // Realtime is working, stop polling
            stopPolling();
          } else if (status === "CHANNEL_ERROR") {
            console.error("Failed to subscribe to realtime updates");
            realtimeEnabled = false;
            setIsRealtimeWorking(false);
            
            // Realtime failed, start polling
            setupPolling();
          } else if (status === "TIMED_OUT") {
            console.error("Subscription timed out");
            realtimeEnabled = false;
            setIsRealtimeWorking(false);
            setupPolling();
          }
        });
      } catch (subscribeError) {
        console.error("Failed to subscribe to channel:", subscribeError);
        realtimeEnabled = false;
        setIsRealtimeWorking(false);
        setupPolling();
      }
    } catch (error) {
      console.error("Error setting up realtime subscription:", error);
      realtimeEnabled = false;
      setIsRealtimeWorking(false);
      
      // Realtime setup failed, start polling
      setupPolling();
    }

    // Clean up subscription when component unmounts
    return () => {
      clearTimeout(defaultPollingId);
      
      try {
        console.log("Cleaning up realtime subscription...");
        if (channelSubscription) {
          supabase.removeChannel(channelSubscription);
        }
        
        // Clear polling interval
        stopPolling();
      } catch (error) {
        console.error("Error removing channel:", error);
      }
    };
  }, [supabase]);

  // Function to check Supabase structure and verify everything is set up correctly
  const checkSupabaseStructure = async () => {
    try {
      console.log("Checking Supabase structure...");
      
      // Test if we can connect to Supabase
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Supabase auth check failed:", userError);
        return;
      }
      
      console.log("Supabase authentication working correctly, user:", user?.id);
      
      // Check if the reminders table exists by trying a small query
      // We'll do this silently (no toast on error) since it's just a diagnostic
      try {
        const { data, error } = await supabase
          .from("reminders")
          .select("id")
          .limit(1);
          
        if (error) {
          console.error("Error accessing reminders table:", error);
          // Silent failure - we'll attempt operations anyway
        } else {
          console.log("Successfully connected to reminders table");
        }
      } catch (tableError) {
        console.error("Exception when checking reminders table:", tableError);
        // Silent failure - we'll attempt operations anyway
      }
      
      // Check if we can enable realtime subscriptions
      try {
        const channel = supabase.channel('test-channel');
        if (channel) {
          console.log("Realtime subscription is available");
          // No need to actually subscribe, just checking if we can create a channel
          try {
            supabase.removeChannel(channel);
          } catch (e) {
            // Ignore errors when removing test channel
          }
        }
      } catch (realtimeErr) {
        console.error("Realtime might not be available:", realtimeErr);
        // Don't show a toast here, we'll fallback to polling
      }
    } catch (err) {
      console.error("Error checking Supabase structure:", err);
      // Don't show any error toast here, just log the error
    }
  };

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
        reminders={ensureReadingList(activeReminders)} 
        onDone={handleDone} 
        onArchive={handleArchive} 
      />}
      
      <div className="flex justify-end gap-2 items-center">
        {isRealtimeWorking !== null && (
          <div className="flex items-center mr-2">
            <div 
              className={`w-2 h-2 rounded-full mr-1 ${isRealtimeWorking ? 'bg-green-500' : 'bg-amber-500'}`}
              title={isRealtimeWorking ? 'Real-time updates active' : 'Using fallback polling'}
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isRealtimeWorking ? 'Real-time' : 'Polling'}
            </span>
          </div>
        )}
        <Button 
          variant="outline" 
          onClick={fetchReminders} 
          className="rounded-md shadow hover:shadow-md transition-all"
        >
          Refresh Reminders
        </Button>
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
          <DailySynopsis reminders={ensureReadingList(activeReminders)} onDone={handleDone} onArchive={handleArchive} />
          <ReminderTaskList 
            reminders={ensureReadingList(previousReminders)} 
            onDone={handleDone} 
            onArchive={handleArchive}
            title="Previous Reminders"
            emptyMessage="No previous reminders found."
          />
          
          <h2 className="text-xl font-semibold mt-12 mb-6">Insights & Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
            <MotivationWidget reminders={ensureReadingList(activeReminders)} />
            <EnergyTrends reminders={ensureReadingList(activeReminders)} />
            <TagUsage reminders={ensureReadingList(activeReminders)} />
            <TimeOfDayActivity reminders={ensureReadingList(activeReminders)} />
            <MoodCorrelation reminders={ensureReadingList(activeReminders)} />
            <TrendInsights reminders={ensureReadingList(activeReminders)} />
            <KeywordCloud reminders={ensureReadingList(activeReminders)} />
          </div>
        </>
      )}
      
      {showArchived && (
        <ReminderTaskList 
          reminders={ensureReadingList(archivedReminders)} 
          onDone={handleDone} 
          onArchive={handleArchive}
          title="Archived Reminders"
          emptyMessage="No archived reminders found."
        />
      )}
    </div>
  );
}