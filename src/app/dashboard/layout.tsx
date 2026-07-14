import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-auth/server";
import { dashboardUsesGoogleAuth } from "@/lib/dashboard-auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const googleAuth = dashboardUsesGoogleAuth();
  const user = googleAuth
    ? await getDashboardUser()
    : (await (await createClient()).auth.getUser()).data.user;

  return (
    <DashboardShell userEmail={user?.email ?? null} authMode={googleAuth ? "google" : "supabase"}>{children}</DashboardShell>
  );
}
