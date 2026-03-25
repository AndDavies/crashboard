import type { Metadata } from "next";
import { BookOpenText, Database, Tags } from "lucide-react";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardContentSections, dashboardRouteNotes } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Notes" };

export default function ContentNotesPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Repository / library
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {dashboardRouteNotes.notes}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpenText className="size-4 text-muted-foreground" />
              Corpus shape
            </CardTitle>
            <CardDescription>
              The library should become the primary private browsing surface for saved material.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Articles, PDFs, YouTube transcripts, and X captures belong here with readable extracted content and provenance.
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tags className="size-4 text-muted-foreground" />
              Tagging model
            </CardTitle>
            <CardDescription>
              User hashtags and Leroy enrichment should both be visible and searchable.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Preserve Telegram hashtags as user intent, then layer lightweight summaries, keywords, and topic hints on top.
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-muted-foreground" />
              Storage model
            </CardTitle>
            <CardDescription>
              The repository should align to the simpler document-first reset.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            One canonical document row, clean provenance, searchable tags, related links, then chunking and embeddings later.
          </CardContent>
        </Card>
      </div>

      {dashboardContentSections.map((section) => (
        <DashboardSectionCard key={section.title} {...section} />
      ))}
    </div>
  );
}
