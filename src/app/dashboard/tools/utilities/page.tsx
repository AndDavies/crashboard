import type { Metadata } from "next";
import { FileCode2, ShieldCheck, Wrench } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { dashboardRouteNotes } from "@/lib/dashboard/data";

export const metadata: Metadata = { title: "Utilities" };

const utilities = [
  {
    title: "Endpoint helpers",
    description:
      "Low-level ingestion and auth helpers that support the dashboard and API routes.",
    icon: Wrench,
  },
  {
    title: "Schema and payload validation",
    description:
      "Structured ingestion depends on typed contracts, normalization helpers, and predictable persistence inputs.",
    icon: FileCode2,
  },
  {
    title: "Operational safeguards",
    description:
      "Bearer verification, middleware, and environment-aware utilities should stay visible as infrastructure rather than hidden incidental code.",
    icon: ShieldCheck,
  },
];

export default function ToolsUtilitiesPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Utilities
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {dashboardRouteNotes.utilities}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {utilities.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              This route now reflects real system-support utilities rather than a generic one-off tools placeholder.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
