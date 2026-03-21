import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Strain" };

export default function WhoopStrainPage() {
  return (
    <DashboardPlaceholder description="Day strain, workouts, and training load from Whoop." />
  );
}
