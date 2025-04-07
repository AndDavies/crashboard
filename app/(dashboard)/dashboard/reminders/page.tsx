// app/reminders/page.tsx
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RemindersClient, Reminder } from '@/components/RemindersClient';

// Server-side: Fetch initial reminders
export default async function RemindersPage() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Error fetching user:', userError.message);
      throw new Error('Failed to authenticate user');
    }
    if (!user) {
      redirect('/login');
    }

    const { data: reminders, error: remindersError } = await supabase
      .from('reminders')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_open', true)
      .order('created_at', { ascending: false });

    if (remindersError) {
      console.error('Error fetching reminders:', remindersError.message);
      throw new Error('Failed to fetch reminders');
    }

    // Transform reminders to match the Reminder type (convert null to undefined for category)
    const transformedReminders = (reminders || []).map((reminder: any) => ({
      ...reminder,
      category: reminder.category ?? undefined, // Convert null to undefined
    })) as Reminder[];

    return <RemindersClient initialReminders={transformedReminders} userId={user.id} />;
  } catch (error) {
    console.error('Error in RemindersPage:', error);
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Reminders</h1>
        <p className="text-red-500">An error occurred while loading reminders. Please try again later.</p>
      </div>
    );
  }
}