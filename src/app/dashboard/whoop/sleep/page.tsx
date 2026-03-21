import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Sleep" };

export default function WhoopSleepPage() {
  return (
    <DashboardPlaceholder description="Sleep performance, stages, and consistency over time." />
  );
}
