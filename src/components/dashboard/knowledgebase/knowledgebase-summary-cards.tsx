import { DashboardMetricCard } from "@/components/dashboard/dashboard-metric-card";

export function KnowledgebaseSummaryCards({
  stats,
}: {
  stats: { total: number; inbox: number; reviewed: number; issues: number };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <DashboardMetricCard
        label="Total documents"
        value={String(stats.total)}
        hint="Saved repository entries"
      />
      <DashboardMetricCard
        label="Needs review"
        value={String(stats.inbox)}
        hint="review_status = inbox"
      />
      <DashboardMetricCard
        label="Reviewed"
        value={String(stats.reviewed)}
        hint="Repository items triaged"
      />
      <DashboardMetricCard
        label="Partial / failed"
        value={String(stats.issues)}
        hint="Items needing attention"
      />
    </div>
  );
}
