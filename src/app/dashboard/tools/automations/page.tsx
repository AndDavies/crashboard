import type { Metadata } from "next";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardRouteNotes, dashboardToolSections } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Automations" };

export default function ToolsAutomationsPage() {
  const automationSection = dashboardToolSections[0];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Automations
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {dashboardRouteNotes.automations}
        </p>
      </section>

      {automationSection ? <DashboardSectionCard {...automationSection} /> : null}

      <Card className="shadow-none">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="text-base">Current automation shape</CardTitle>
          <CardDescription>
            These are the operational surfaces the dashboard should make legible right now.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Telegram topic capture, OpenClaw orchestration, Leroy extraction, structured ingestion endpoints, and database persistence are the main automation lanes already implied by the current docs and codebase.
        </CardContent>
      </Card>
    </div>
  );
}
