import type { Metadata } from "next";
import { BedDouble, Gauge, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sleep" };

const sleepPanels = [
  {
    title: "Sleep performance",
    description:
      "Total sleep, debt, and target attainment should be the base layer for this route.",
    icon: BedDouble,
  },
  {
    title: "Quality and staging",
    description:
      "Once data is wired, the view should separate simple totals from deeper sleep-quality signals.",
    icon: Gauge,
  },
  {
    title: "Trend awareness",
    description:
      "The route should emphasize consistency over time, not just one-night snapshots.",
    icon: TrendingUp,
  },
];

export default function WhoopSleepPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Sleep
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Sleep remains scaffolded, but this page now describes the intended dashboard use: readable sleep performance, quality context, and longitudinal trends.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {sleepPanels.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              When implemented, reuse the existing dashboard card language instead of introducing a different visual system.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
