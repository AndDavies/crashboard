import type { Metadata } from "next";
import { Activity, Dumbbell, Flame } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Strain" };

const strainPanels = [
  {
    title: "Daily load",
    description:
      "This route should become the simple at-a-glance measure of current day strain and training pressure.",
    icon: Flame,
  },
  {
    title: "Workout context",
    description:
      "Session-level activity context should support the daily score instead of leaving it abstract.",
    icon: Dumbbell,
  },
  {
    title: "Progression and balance",
    description:
      "The page should eventually help compare load versus recovery over time.",
    icon: Activity,
  },
];

export default function WhoopStrainPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Strain
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Strain is still a future WHOOP data page. The copy now frames the route around actual intended usage instead of a generic placeholder.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {strainPanels.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              The page should stay consistent with the current dashboard card/grid style once live WHOOP data is added.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
