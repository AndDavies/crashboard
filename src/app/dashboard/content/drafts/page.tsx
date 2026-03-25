import type { Metadata } from "next";
import { Clock3, ListChecks, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardRouteNotes } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Drafts" };

const lanes = [
  {
    title: "Inbox / unreviewed",
    description:
      "Fresh captures that have landed in the repository but have not been reviewed or cleaned up yet.",
    icon: Clock3,
  },
  {
    title: "Needs enrichment",
    description:
      "Items where titles, summaries, tags, or extraction quality still need a pass before the corpus is reliable.",
    icon: Sparkles,
  },
  {
    title: "Ready for promotion",
    description:
      "Documents that are structured enough to move into the main library or feed later publishing/query workflows.",
    icon: ListChecks,
  },
];

export default function ContentDraftsPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Review queue
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {dashboardRouteNotes.drafts}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {lanes.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              This route now reflects repository triage and processing stages rather than a generic writing-drafts placeholder.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
