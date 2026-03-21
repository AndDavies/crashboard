import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Other projects" };

export default function ProjectsOtherPage() {
  return (
    <DashboardPlaceholder description="Scratch space for additional apps and experiments." />
  );
}
