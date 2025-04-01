import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() { // Changed to async
  const cookieStore = await cookies() // Await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      async get(name) { // Add async
        return (await cookieStore.get(name))?.value // Await get()
      },
      async set(name, value, options) { // Add async
        await cookieStore.set({ name, value, ...options }) // Await set()
      },
      async remove(name, options) { // Add async
        await cookieStore.set({ name, value: "", ...options }) // Await set()
      },
    },
  })
}