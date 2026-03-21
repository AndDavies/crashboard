import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Drafts" };

export default function ContentDraftsPage() {
  return (
    <DashboardPlaceholder description="Work-in-progress writing before publishing." />
  );
}
