import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Utilities" };

export default function ToolsUtilitiesPage() {
  return (
    <DashboardPlaceholder description="Small helpers: formatters, generators, and one-off tools." />
  );
}
