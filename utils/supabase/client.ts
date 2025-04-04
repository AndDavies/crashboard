import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  // Create a supabase client on the browser with project's credentials
  try {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        // Basic configuration with defaults
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      }
    )
  } catch (error) {
    console.error("Error creating Supabase client:", error);
    // Return a minimal client when there's an error
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
}

