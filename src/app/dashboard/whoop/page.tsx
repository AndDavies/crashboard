import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Whoop" };

export default function WhoopDashboardPage() {
  return (
    <DashboardPlaceholder description="Summary metrics and quick links into recovery, sleep, and strain." />
  );
}
