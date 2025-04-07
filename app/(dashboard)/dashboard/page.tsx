import { createSupabaseServerClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UpcomingRemindersWidget } from "@/components/dashboard/UpcomingRemindersWidget";
import { ToDoSnapshotWidget } from "@/components/dashboard/ToDoSnapshotWidget";
import { NeedsVsWantsWidget } from "@/components/dashboard/NeedsVsWantsWidget";
import { ReadingListWidget } from "@/components/dashboard/ReadingListWidget";
import { QuoteOfTheDayWidget } from "@/components/dashboard/QuoteOfTheDayWidget";

// Define Reminder type for existing widgets
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

// Define Quote type for the Quote of the Day widget
export type Quote = {
  id: number;
  quote_text: string;
  author: string;
  theme: 'grounding' | 'presence' | 'acceptance' | 'surrender' | 'bible_verse' | 'taoist' | 'buddhist' | 'spiritual_leader' | null;
  context: string;
  application: string;
  scheduled_date: string | null;
  created_at: string;
  updated_at: string;
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Fetch reminders for existing widgets
  const { data: remindersData, error: remindersError } = await supabase
    .from("reminders")
    .select("id, title, due_date, is_pinned, category, color, energy_scale, tags, is_open, is_done")
    .eq("user_id", user.id)
    .order("is_pinned", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false });

  let reminders: Reminder[] = [];
  if (remindersError) {
    console.error("Error fetching reminders for widgets:", remindersError.message, remindersError.details);
  } else {
    reminders = (remindersData || []).map(r => ({
      ...r,
      category: r.category ?? undefined,
      tags: r.tags || [],
    })) as Reminder[];
  }

  // Fetch the first quote for the Quote of the Day widget
  let quote: Quote | null = null;
  try {
    const { data: quoteData, error: quoteError } = await supabase
      .from("quote_of_the_day")
      .select("id, quote_text, author, theme, context, application, scheduled_date, created_at, updated_at")
      .order("id", { ascending: true })
      .limit(1);

    if (quoteError) {
      throw new Error(`Failed to fetch quote: ${quoteError.message} (Code: ${quoteError.code}, Details: ${quoteError.details}, Hint: ${quoteError.hint})`);
    }

    if (quoteData && quoteData.length > 0) {
      quote = quoteData[0] as Quote;
    }
  } catch (err) {
    console.error("Error fetching quote of the day:", err instanceof Error ? err.message : err);
  }

  // Filter reminders for existing widgets
  const toDoReminders = reminders.filter(r => r.is_open && !r.is_done);
  const needsVsWantsReminders = reminders.filter(r => r.category === 'need_to_do' || r.category === 'want_to_do');
  const readingListReminders = reminders.filter(r => r.category === 'reading_list');

  return (
    <div className="space-y-6 p-4">

      {/* Bento-box grid layout */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Widget 1: Quote of the Day (Cosmic Latte) - Moved to the top, spans full width */}
        <div className="md:col-span-2 lg:col-span-3">
          <QuoteOfTheDayWidget quote={quote} />
        </div>

        {/* Widget 2: To-Do Snapshot (Emerald Green) */}
        <div className="md:col-span-1 lg:col-span-1">
          <ToDoSnapshotWidget reminders={toDoReminders} />
        </div>

        {/* Widget 3: Needs vs Wants (Maximum Yellow) */}
        <div className="md:col-span-1 lg:col-span-1">
          <NeedsVsWantsWidget reminders={needsVsWantsReminders} />
        </div>

        {/* Widget 4: Reading List (Antique White) */}
        <div className="md:col-span-2 lg:col-span-1">
          <ReadingListWidget reminders={readingListReminders} />
        </div>

        {/* Widget 5: Upcoming Reminders (Dark Pastel Red) */}
        <div className="md:col-span-1 lg:col-span-3">
          <UpcomingRemindersWidget reminders={reminders.slice(0, 5)} />
        </div>

      </div>
    </div>
  );
}