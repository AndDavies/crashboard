import { createSupabaseServerClient } from "@/utils/supabase/server";
import ReminderCard from "@/components/ReminderCard";
import QuickCapture from "@/components/QuickCapture";

export default async function RemindersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <div>Please log in to view reminders.</div>;
  }

  const { data: reminders, error } = await supabase
    .from("reminders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching reminders:", error);
    return <div>Error loading reminders.</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Reminders</h1>
      <QuickCapture />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reminders && reminders.length > 0 ? (
          reminders.map((reminder) => (
            <ReminderCard key={reminder.id} reminder={reminder} />
          ))
        ) : (
          <p className="text-gray-500">No reminders yet. Add one above!</p>
        )}
      </div>
    </div>
  );
}