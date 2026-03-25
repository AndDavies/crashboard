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

export const metadata: Metadata = { title: "Experiments" };

export default function ToolsExperimentsPage() {
  const experimentSection = dashboardToolSections[1];

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Experiments
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {dashboardRouteNotes.experiments}
        </p>
      </section>

      {experimentSection ? <DashboardSectionCard {...experimentSection} /> : null}

      <Card className="shadow-none">
        <CardHeader className="border-b border-border/60 pb-3">
          <CardTitle className="text-base">Why this stays separate</CardTitle>
          <CardDescription>
            The docs are explicit that repository usefulness comes before semantic retrieval infrastructure.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Keep chunking, embeddings, reranking, and ask/query UX in the experimental lane until the underlying document corpus, provenance, and tagging model are stable.
        </CardContent>
      </Card>
    </div>
  );
}
