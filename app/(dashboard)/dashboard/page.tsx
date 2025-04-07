import { createSupabaseServerClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpcomingRemindersWidget } from "@/components/dashboard/UpcomingRemindersWidget";
import { ToDoSnapshotWidget } from "@/components/dashboard/ToDoSnapshotWidget";
import { NeedsVsWantsWidget } from "@/components/dashboard/NeedsVsWantsWidget";
import { ReadingListWidget } from "@/components/dashboard/ReadingListWidget";

// Define Reminder type with additional fields needed for statistics
type ColorKey = 'soft-blue' | 'soft-green' | 'soft-red' | 'soft-yellow' | 'soft-purple' | 'soft-gray';
export type Reminder = {
  id: string;
  title: string;
  due_date: string | null;
  is_pinned: boolean;
  category?: 'need_to_do' | 'want_to_do' | 'reading_list' | null | undefined;
  color: ColorKey;
  energy_scale: number;
  tags: string[];
  is_open: boolean;
  is_done: boolean;
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Fetch reminders for all widgets
  const { data: remindersData, error: remindersError } = await supabase
    .from("reminders")
    .select("id, title, due_date, is_pinned, category, color, energy_scale, tags, is_open, is_done")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false });

  let reminders: Reminder[] = [];
  if (remindersError) {
    console.error("Error fetching reminders for widgets:", remindersError);
  } else {
    reminders = (remindersData || []).map(r => ({
      ...r,
      category: r.category ?? undefined,
      tags: r.tags || [],
    })) as Reminder[];
  }

  // Filter for each widget
  const toDoReminders = reminders.filter(r => r.is_open && !r.is_done);
  const needsVsWantsReminders = reminders.filter(r => r.category === 'need_to_do' || r.category === 'want_to_do');
  const readingListReminders = reminders.filter(r => r.category === 'reading_list');

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Welcome back!</p>
        </CardContent>
      </Card>

      {/* Bento-box grid layout */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Widget 1: To-Do Snapshot (Emerald Green) */}
        <div className="md:col-span-1 lg:col-span-1">
          <ToDoSnapshotWidget reminders={toDoReminders} />
        </div>

        {/* Widget 2: Needs vs Wants (Maximum Yellow) */}
        <div className="md:col-span-1 lg:col-span-1">
          <NeedsVsWantsWidget reminders={needsVsWantsReminders} />
        </div>

        {/* Widget 3: Reading List (Antique White) */}
        <div className="md:col-span-2 lg:col-span-1">
          <ReadingListWidget reminders={readingListReminders} />
        </div>

        {/* Existing Upcoming Reminders Widget (Dark Pastel Red) */}
        <div className="md:col-span-1 lg:col-span-2">
          <UpcomingRemindersWidget reminders={reminders.slice(0, 5)} />
        </div>

        {/* Placeholder for Activity Feed (Papaya Whip) */}
        <div className="md:col-span-1 lg:col-span-1">
          <Card style={{ backgroundColor: '#FFF1D4' }}>
            <CardHeader>
              <CardTitle>Activity Feed</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Other content...</p>
            </CardContent>
          </Card>
        </div>

        {/* Placeholder for another widget (Cosmic Latte) */}
        <div className="md:col-span-1 lg:col-span-2">
          <Card style={{ backgroundColor: '#FFF8EB' }}>
            <CardHeader>
              <CardTitle>More Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Additional content...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}