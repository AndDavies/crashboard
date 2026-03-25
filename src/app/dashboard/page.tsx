import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  dashboardActiveWorkstream,
  dashboardImplementationBullets,
  dashboardOpsLinks,
  dashboardOverviewMetrics,
  dashboardOverviewSections,
  dashboardRecentChanges,
  dashboardSystemSurfaces,
} from "@/lib/dashboard/data";

export const metadata: Metadata = {
  title: "Dashboard · Crashboard",
  description: "Private control surface for Crashboard, OpenClaw, and the Personal Knowledgebase.",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border border-border/80 bg-muted/30 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-normal">
                Private dashboard
              </Badge>
              <Badge variant="secondary" className="font-normal">
                Repository-first roadmap
              </Badge>
            </div>
            <div className="space-y-1">
              <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
                Crashboard is now the operating surface for your private repository and app work.
              </h2>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{user?.email ?? "you"}</span>. The dashboard now centers on the Personal Knowledgebase buildout, OpenClaw operations, and integration status without changing the existing shell or route structure.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/content/notes"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Open repository views
            </Link>
            <Link
              href="/dashboard/openclaw/projects"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Review linked projects
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardOverviewMetrics.map((metric) => (
            <DashboardMetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-base">Current workstream</CardTitle>
            <CardDescription>
              These are the active product and implementation themes reflected in the docs and current codebase direction.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="grid gap-2 sm:grid-cols-2">
              {dashboardActiveWorkstream.map((item) => (
                <li
                  key={item}
                  className="rounded-lg border border-border/70 bg-background px-4 py-3 text-sm text-muted-foreground"
                >
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-base">System surfaces</CardTitle>
            <CardDescription>
              Existing platform surfaces already present in the project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-4">
            {dashboardSystemSurfaces.map((surface) => (
              <div
                key={surface.label}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-4 py-3"
              >
                <span className="text-sm font-medium text-foreground">{surface.label}</span>
                <span className="text-sm text-muted-foreground">{surface.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {dashboardOverviewSections.map((section) => (
          <DashboardSectionCard key={section.title} {...section} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="shadow-none">
          <CardHeader className="border-b border-border/60 pb-3">
            <CardTitle className="text-base">Recent product/app changes</CardTitle>
            <CardDescription>
              The dashboard copy now reflects these current product decisions instead of generic placeholders.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              {dashboardRecentChanges.map((item) => (
                <li key={item} className="rounded-lg border border-border/70 bg-background px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-base">Implementation pattern</CardTitle>
              <CardDescription>
                Keep using the current structure rather than introducing a new dashboard architecture.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                {dashboardImplementationBullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-base">Quick routes</CardTitle>
              <CardDescription>
                The existing dashboard routes now map more clearly to current product work.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {dashboardOpsLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block rounded-lg border border-border/70 bg-background px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
