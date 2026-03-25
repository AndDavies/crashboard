import type { Metadata } from "next";
import { ArrowUpRight, FileText, Share2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardRouteNotes } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Publishing" };

const outputs = [
  {
    title: "Public writing",
    description:
      "Curated articles, essays, and public-site material distilled from saved repository content.",
    icon: FileText,
  },
  {
    title: "Structured exports",
    description:
      "Portable summaries, source packets, or downstream payloads generated from reviewed documents.",
    icon: Share2,
  },
  {
    title: "Knowledge handoff",
    description:
      "A later-phase bridge from repository material into retrieval, synthesis, and external publishing surfaces.",
    icon: ArrowUpRight,
  },
];

export default function ContentPublishingPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Publishing and export
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {dashboardRouteNotes.publishing}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {outputs.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              Keep this route aligned to repository outputs and curated knowledge flows instead of a disconnected publishing checklist.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
