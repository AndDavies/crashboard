import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Log the current path and session status for debugging
  console.log(`Middleware: Path=${req.nextUrl.pathname}, HasSession=${!!session}`)

  // Check if we're on an auth page
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/sign-in") ||
    req.nextUrl.pathname.startsWith("/sign-up") ||
    req.nextUrl.pathname.startsWith("/forgot-password")

  // If we have a session and we're on an auth page, redirect to dashboard
  if (session && isAuthPage) {
    console.log("Middleware: Redirecting from auth page to dashboard")
    return NextResponse.redirect(new URL("/", req.url))
  }

  // IMPORTANT: We're temporarily disabling the redirect to sign-in to break the loop
  // If we don't have a session and we're not on an auth page, redirect to sign-in
  // if (!session && !isAuthPage && !req.nextUrl.pathname.startsWith('/auth')) {
  //   console.log("Middleware: No session, redirecting to sign-in")
  //   return NextResponse.redirect(new URL('/sign-in', req.url))
  // }

  // Instead of redirecting, we'll just pass through and let the client handle auth
  return res
}

// Update matcher to be more specific and exclude problematic paths
export const config = {
  matcher: ["/((?!_next/static|_next/image|api|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.jpeg).*)"],
}

