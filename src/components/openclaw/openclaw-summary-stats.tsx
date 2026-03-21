import { cn } from "@/lib/utils";
import {
  OpenClawStatCard,
  type OpenClawStat,
} from "@/components/openclaw/openclaw-stat-card";

export function OpenClawSummaryStats({
  stats,
  className,
}: {
  stats: OpenClawStat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        className,
      )}
    >
      {stats.map((s) => (
        <OpenClawStatCard key={s.label} {...s} />
      ))}
    </div>
  );
}
