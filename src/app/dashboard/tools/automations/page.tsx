import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Automations" };

export default function ToolsAutomationsPage() {
  return (
    <DashboardPlaceholder description="Scheduled jobs, webhooks, and workflow triggers." />
  );
}
