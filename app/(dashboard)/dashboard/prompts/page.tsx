import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import PromptGeneratorClient from '@/components/PromptGeneratorClient';

// Define the type for a prompt object (matching the client component)
type Prompt = {
  id: number;
  context: string;
  type: string;
  seed?: string | null;
  prompt: string;
  created_at: string;
};

export default async function PromptGeneratorPage() {
  // Await cookies() before creating the client
  const cookieStore = await cookies(); 

  // Create Supabase client with resolved cookie handlers
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // Access the resolved cookie store
          return cookieStore.get(name)?.value; 
        },
        // Provide stubs for set/remove
        set(name: string, value: string, options: CookieOptions) {
          console.log('Server Component attempted to set cookie', name); 
        },
        remove(name: string, options: CookieOptions) {
          console.log('Server Component attempted to remove cookie', name); 
        },
      },
    }
  );

  // Fetch initial saved prompts for the logged-in user
  const { data: { user } } = await supabase.auth.getUser();
  
  let initialPrompts: Prompt[] = [];
  if (user) {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching initial prompts:", error.message);
      // Handle error appropriately
    } else {
      initialPrompts = data || [];
    }
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Prompt Generator</h1>
      <PromptGeneratorClient initialPrompts={initialPrompts} />
    </div>
  );
}