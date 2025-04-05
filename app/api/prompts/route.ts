import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Define GET handler
export async function GET() {
  const cookieStore = await cookies(); // Await cookies() to get the resolved store

  // Create the Supabase client, passing resolved cookie handling functions
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // Access the resolved cookie store instance
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // Access the resolved cookie store instance
            cookieStore.set({ name, value, ...options });
          } catch (error) {
             console.log(`Note: Failed to set cookie '${name}' in Route Handler.`);
          }
        },
        remove(name: string, options: CookieOptions) {
           try {
             // Access the resolved cookie store instance
             cookieStore.set({ name, value: '', ...options });
           } catch (error) {
              console.log(`Note: Failed to remove cookie '${name}' in Route Handler.`);
           }
        },
      },
    }
  );

  // Proceed with Supabase operations (awaiting them)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

// Define POST handler (similar structure)
export async function POST(request: Request) {
  const cookieStore = await cookies(); // Await cookies() to get the resolved store

  // Create Supabase client with resolved cookie handlers
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {
             console.log(`Note: Failed to set cookie '${name}' in Route Handler.`);
          }
        },
        remove(name: string, options: CookieOptions) {
           try {
            cookieStore.set({ name, value: '', ...options });
           } catch (error) {
              console.log(`Note: Failed to remove cookie '${name}' in Route Handler.`);
           }
        },
      },
    }
  );

  // Proceed with async Supabase operations
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { context, type, seed, prompt } = await request.json();

  if (!context || !type || !prompt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('prompts')
    .insert({ context, type, seed, prompt, user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error('Error saving prompt:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
} 