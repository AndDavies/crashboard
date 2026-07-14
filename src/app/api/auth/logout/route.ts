import { NextResponse, type NextRequest } from "next/server";
import { DASHBOARD_SESSION_COOKIE } from "@/lib/dashboard-auth/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(DASHBOARD_SESSION_COOKIE, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 0,
  });
  return response;
}
