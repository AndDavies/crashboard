import type { Metadata } from "next";
import { DashboardPlaceholder } from "@/components/dashboard/dashboard-placeholder";

export const metadata: Metadata = { title: "Recovery" };

export default function WhoopRecoveryPage() {
  return (
    <DashboardPlaceholder description="Recovery scores, HRV context, and rest guidance from Whoop." />
  );
}
