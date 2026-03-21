import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Crashboard project" };

export default function ProjectCrashboardPage() {
  return (
    <DashboardPlaceholder description="Internal tools and ops for your personal site and dashboard." />
  );
}
