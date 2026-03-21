import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Experiments" };

export default function ToolsExperimentsPage() {
  return (
    <DashboardPlaceholder description="Prototypes and spikes that might graduate into real tools." />
  );
}
