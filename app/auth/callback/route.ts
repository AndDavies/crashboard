import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const origin = requestUrl.origin

  if (code) {
    try {
      const cookieStore = cookies()
      const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error("Auth callback: Error exchanging code for session:", error)
        // Redirect to sign-in with error
        return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_error`)
      }

      console.log("Auth callback: Successfully exchanged code for session")

      // Redirect to dashboard
      return NextResponse.redirect(`${origin}/`)
    } catch (error) {
      console.error("Auth callback: Unexpected error:", error)
      return NextResponse.redirect(`${origin}/sign-in?error=unexpected_error`)
    }
  }

  // If no code is present, redirect to sign-in
  return NextResponse.redirect(`${origin}/sign-in?error=no_code`)
}

