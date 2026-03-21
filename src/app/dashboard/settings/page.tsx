import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function DashboardSettingsPage() {
  return (
    <DashboardPlaceholder description="Account, integrations, and dashboard defaults (coming soon)." />
  );
}
