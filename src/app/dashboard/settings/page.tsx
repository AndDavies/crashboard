import type { Metadata } from "next";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardSettingsSections } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Settings" };

export default function DashboardSettingsPage() {
  const settingsSection = dashboardSettingsSections[0];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Settings and configuration
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          This route should describe the real control points already present in the app: authenticated dashboard access, integration redirects, and environment-backed configuration.
        </p>
      </section>

      {settingsSection ? <DashboardSectionCard {...settingsSection} /> : null}

      <Card className="shadow-none">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="text-base">Current configuration focus</CardTitle>
          <CardDescription>
            Keep this page scoped to what actually exists today.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Supabase auth/session handling, site URL configuration, WHOOP OAuth settings, and ingestion endpoint secrets are the meaningful settings surfaces now. Avoid inventing a full account-management system before it is needed.
        </CardContent>
      </Card>
    </div>
  );
}
