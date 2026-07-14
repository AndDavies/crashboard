import { NextResponse, type NextRequest } from "next/server";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardUsesGoogleAuth,
  verifyDashboardSession,
} from "@/lib/dashboard-auth/session";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  if (!dashboardUsesGoogleAuth()) return updateSession(request);
  const user = await verifyDashboardSession(
    request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value,
  );
  if (!user) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
