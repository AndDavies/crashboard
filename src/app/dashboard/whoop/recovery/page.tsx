import type { Metadata } from "next";
import { HeartPulse, MoonStar, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Recovery" };

const recoveryPanels = [
  {
    title: "Readiness",
    description:
      "Recovery should eventually become the daily readiness surface for rest, effort, and pacing decisions.",
    icon: HeartPulse,
  },
  {
    title: "Sleep context",
    description:
      "Recovery needs to sit beside sleep duration, consistency, and recent quality rather than as a disconnected score.",
    icon: MoonStar,
  },
  {
    title: "Trustworthy interpretation",
    description:
      "When data arrives, the page should prioritize clear context and trends instead of decorative metrics.",
    icon: ShieldCheck,
  },
];

export default function WhoopRecoveryPage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Recovery
        </h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Recovery remains a planned WHOOP data view. The route now reflects the intended product shape instead of a bare placeholder.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {recoveryPanels.map(({ title, description, icon: Icon }) => (
          <Card key={title} className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 text-sm text-muted-foreground">
              WHOOP OAuth is connected separately; data hydration for this route is a future pass.
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
