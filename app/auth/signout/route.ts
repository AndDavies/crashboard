import { createSupabaseServerClient } from '@/utils/supabase/server';
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const requestUrl = new URL(request.url)
  const supabase = await createSupabaseServerClient() // Await here

  await supabase.auth.signOut()

  return NextResponse.redirect(`${requestUrl.origin}/login`, {
    status: 302,
  })
}