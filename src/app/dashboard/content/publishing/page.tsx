import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Publishing" };

export default function ContentPublishingPage() {
  return (
    <DashboardPlaceholder description="Checklists and actions to ship content to the public site." />
  );
}
