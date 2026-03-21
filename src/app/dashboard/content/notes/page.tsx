import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Notes" };

export default function ContentNotesPage() {
  return (
    <DashboardPlaceholder description="Quick captures and reference material." />
  );
}
