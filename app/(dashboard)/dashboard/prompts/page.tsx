import { createClient } from '@/utils/supabase/server';
import PromptGenerator from '@/components/PromptGenerator';
import { redirect } from 'next/navigation';
import { User } from '@supabase/supabase-js';

export default async function PromptsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">Prompt Generator Because Andrew Is Slow Minded</h1>
      <PromptGenerator user={user as User} />
    </div>
  );
}