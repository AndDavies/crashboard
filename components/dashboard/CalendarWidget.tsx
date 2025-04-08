"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import { EventCalendar, type CalendarEvent as BaseCalendarEvent } from "../event-calendar";

// Extend the CalendarEvent type to include Supabase-specific fields
type CalendarEvent = BaseCalendarEvent & {
  user_id: string;
  created_at: string;
  updated_at: string;
};

// Define the EventColor type to match the expected colors
type EventColor = "sky" | "amber" | "orange" | "violet" | "emerald" | "rose";

// Map EventColor literals to hex values for Supabase storage
const colorMap: { [key in EventColor]: string } = {
  sky: "#C1B2D3",    // Dusty Lilac
  amber: "#F1BE49",   // Maximum Yellow
  orange: "#D77A61",  // Clay Orange
  violet: "#5B8C82",  // Muted Teal
  emerald: "#317039", // Emerald Green
  rose: "#CC4B24",    // Dark Pastel Red
};

// Initialize the Supabase client for client-side operations
const supabase = createClient();

interface CalendarWidgetProps {
  initialEvents: CalendarEvent[];
}

export function CalendarWidget({ initialEvents }: CalendarWidgetProps) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [isSaving, setIsSaving] = useState(false);

  // Sync initial events with state
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  // Handle adding a new event
  const handleEventAdd = async (event: BaseCalendarEvent) => {
    console.log("handleEventAdd called with event:", event); // Debug: Confirm the function is called

    if (isSaving) return; // Prevent multiple submissions
    setIsSaving(true);

    try {
      // Debug: Log the raw event object
      console.log("Adding event with ID:", event.id, "Raw Event:", event);

      // Check if the user is authenticated
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw new Error(`Authentication error: ${userError.message}`);
      }
      if (!user) {
        throw new Error("User is not authenticated. Please log in to add events.");
      }

      // Validate and format event data
      const eventId = event.id;
      if (!eventId || typeof eventId !== "string") {
        throw new Error("Invalid event ID: must be a non-empty string");
      }

      const title = event.title?.trim();
      if (!title) {
        throw new Error("Title is required");
      }

      const description = event.description || null;

      // Validate and format start time
      const startTime = event.start instanceof Date && !isNaN(event.start.getTime())
        ? event.start.toISOString()
        : null;
      if (!startTime) {
        throw new Error("Invalid start time: must be a valid date");
      }

      // Validate and format end time
      const endTime = event.end instanceof Date && !isNaN(event.end.getTime())
        ? event.end.toISOString()
        : null;
      if (!endTime) {
        throw new Error("Invalid end time: must be a valid date");
      }

      const allDay = typeof event.allDay === "boolean" ? event.allDay : false;

      const colorValue = event.color as EventColor;
      const color = colorMap[colorValue] || null;
      if (color && !Object.values(colorMap).includes(color)) {
        throw new Error(`Invalid color: ${color} must be one of ${Object.values(colorMap).join(", ")}`);
      }

      const location = event.location || null;

      const userId = user.id;
      if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        throw new Error("Invalid user ID: must be a valid UUID");
      }

      const eventData = {
        id: eventId,
        title,
        description,
        start_time: startTime,
        end_time: endTime,
        all_day: allDay,
        color,
        location,
        user_id: userId,
      };

      // Debug: Log the data being sent to Supabase
      console.log("Inserting event data into Supabase:", eventData);

      const { data, error } = await supabase
        .from("calendar_events")
        .insert(eventData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to add event: ${error.message} (Code: ${error.code}, Details: ${error.details}, Hint: ${error.hint})`);
      }

      if (data) {
        const newEvent = {
          ...event,
          user_id: data.user_id,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
        setEvents([...events, newEvent]);
        toast.success("Event added successfully!");
        console.log("Successfully added event to Supabase:", newEvent);
      } else {
        throw new Error("No data returned from Supabase after insert");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error adding event:", errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle updating an existing event
  const handleEventUpdate = async (updatedEvent: BaseCalendarEvent) => {
    if (isSaving) return; // Prevent multiple submissions
    setIsSaving(true);

    try {
      // Debug: Log the event ID being updated
      console.log("Updating event with ID:", updatedEvent.id, "Event:", updatedEvent);

      // Check if the user is authenticated
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw new Error(`Authentication error: ${userError.message}`);
      }
      if (!user) {
        throw new Error("User is not authenticated. Please log in to update events.");
      }

      // Check if the event exists in the database
      const { data: existingEvent, error: fetchError } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("id", updatedEvent.id)
        .maybeSingle();

      if (fetchError) {
        throw new Error(`Failed to fetch event: ${fetchError.message}`);
      }

      if (!existingEvent) {
        throw new Error(`Event with ID ${updatedEvent.id} not found in the database`);
      }

      // Validate and format update data
      const title = updatedEvent.title?.trim();
      if (!title) {
        throw new Error("Title is required");
      }

      const description = updatedEvent.description || null;

      const startTime = updatedEvent.start instanceof Date && !isNaN(updatedEvent.start.getTime())
        ? updatedEvent.start.toISOString()
        : null;
      if (!startTime) {
        throw new Error("Invalid start time: must be a valid date");
      }

      const endTime = updatedEvent.end instanceof Date && !isNaN(updatedEvent.end.getTime())
        ? updatedEvent.end.toISOString()
        : null;
      if (!endTime) {
        throw new Error("Invalid end time: must be a valid date");
      }

      const allDay = typeof updatedEvent.allDay === "boolean" ? updatedEvent.allDay : false;

      const colorValue = updatedEvent.color as EventColor;
      const color = colorMap[colorValue] || null;
      if (color && !Object.values(colorMap).includes(color)) {
        throw new Error(`Invalid color: ${color} must be one of ${Object.values(colorMap).join(", ")}`);
      }

      const location = updatedEvent.location || null;

      const updateData = {
        title,
        description,
        start_time: startTime,
        end_time: endTime,
        all_day: allDay,
        color,
        location,
      };

      // Debug: Log the data being sent to Supabase
      console.log("Updating event data in Supabase:", updateData);

      const { data, error } = await supabase
        .from("calendar_events")
        .update(updateData)
        .eq("id", updatedEvent.id)
        .select();

      if (error) {
        throw new Error(`Failed to update event: ${error.message} (Code: ${error.code}, Details: ${error.details}, Hint: ${error.hint})`);
      }

      if (data && data.length > 0) {
        const updatedData = data[0];
        const updatedLocalEvent = {
          ...updatedEvent,
          user_id: updatedData.user_id,
          created_at: updatedData.created_at,
          updated_at: updatedData.updated_at,
        };
        setEvents(
          events.map((event) =>
            event.id === updatedEvent.id ? updatedLocalEvent : event
          )
        );
        toast.success("Event updated successfully!");
        console.log("Successfully updated event in Supabase:", updatedLocalEvent);
      } else {
        throw new Error(`No rows updated for event with ID ${updatedEvent.id}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error updating event:", errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle deleting an event
  const handleEventDelete = async (eventId: string) => {
    if (isSaving) return; // Prevent multiple submissions
    setIsSaving(true);

    try {
      // Check if the user is authenticated
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        throw new Error(`Authentication error: ${userError.message}`);
      }
      if (!user) {
        throw new Error("User is not authenticated. Please log in to delete events.");
      }

      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId);

      if (error) {
        throw new Error(`Failed to delete event: ${error.message} (Code: ${error.code}, Details: ${error.details}, Hint: ${error.hint})`);
      }

      setEvents(events.filter((event) => event.id !== eventId));
      toast.success("Event deleted successfully!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error deleting event:", errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // Map the events to the BaseCalendarEvent type, excluding Supabase-specific fields
  const mappedEvents: BaseCalendarEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    color: event.color,
    location: event.location,
  }));

  return (
    <EventCalendar
      events={mappedEvents}
      onEventAdd={handleEventAdd}
      onEventUpdate={handleEventUpdate}
      onEventDelete={handleEventDelete}
    />
  );
}