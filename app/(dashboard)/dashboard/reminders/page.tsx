import { createSupabaseServerClient } from "@/utils/supabase/server";
import RemindersClient from "@/components/RemindersClient";

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
    return <div>Error loading reminders: {error.message}</div>;
  }

  return (
    <div className="container mx-auto p-0">
      <h1 className="text-2xl font-bold mb-4">Reminders</h1>
      <RemindersClient initialReminders={reminders || []} />
    </div>
  );
}