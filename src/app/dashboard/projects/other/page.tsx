import type { Metadata } from "next";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { dashboardProjectSections } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Other projects" };

export default function ProjectsOtherPage() {
  const adjacent = dashboardProjectSections[1];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Adjacent projects
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Other projects should stay visible in the dashboard as real workstreams with stage and context, not as an empty scratch bucket.
        </p>
      </section>

      {adjacent ? <DashboardSectionCard {...adjacent} /> : null}
    </div>
  );
}
