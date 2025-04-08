import { createSupabaseServerClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { type CalendarEvent as BaseCalendarEvent } from "@/components/event-calendar";

// Extend the CalendarEvent type to include Supabase-specific fields
export type CalendarEvent = BaseCalendarEvent & {
  user_id: string;
  created_at: string;
  updated_at: string;
};

export default async function CalendarPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect to login if the user is not authenticated
  if (!user) {
    return redirect("/login");
  }

  // Fetch events for the authenticated user from the calendar_events table
  let events: CalendarEvent[] = [];
  try {
    const { data: eventsData, error: eventsError } = await supabase
      .from("calendar_events")
      .select("id, title, description, start_time, end_time, all_day, color, location, user_id, created_at, updated_at")
      .eq("user_id", user.id);

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message} (Code: ${eventsError.code}, Details: ${eventsError.details}, Hint: ${eventsError.hint})`);
    }

    if (eventsData && eventsData.length > 0) {
      // Map the Supabase data to the CalendarEvent type (start_time -> start, end_time -> end)
      events = eventsData.map((event) => ({
        ...event,
        start: event.start_time,
        end: event.end_time,
        allDay: event.all_day,
      })) as CalendarEvent[];
    }
  } catch (err) {
    console.error("Error fetching calendar events:", err instanceof Error ? err.message : err);
  }

  return (
    <div className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Calendar</CardTitle>
          <CardDescription>Plan your day with clarity and calm.</CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarWidget initialEvents={events} />
        </CardContent>
      </Card>
    </div>
  );
}