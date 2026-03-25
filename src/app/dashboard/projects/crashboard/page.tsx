import type { Metadata } from "next";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  dashboardProjectFootnotes,
  dashboardProjectSections,
} from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Crashboard project" };

export default function ProjectCrashboardPage() {
  const primary = dashboardProjectSections[0];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Crashboard project
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Crashboard is no longer just a generic private dashboard shell. It is the active implementation home for the Personal Knowledgebase, OpenClaw views, and integration surfaces.
        </p>
      </section>

      {primary ? <DashboardSectionCard {...primary} /> : null}

      <Card className="shadow-none">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="text-base">Execution guardrails</CardTitle>
          <CardDescription>
            Keep changes inside the current dashboard style and structure.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {dashboardProjectFootnotes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
