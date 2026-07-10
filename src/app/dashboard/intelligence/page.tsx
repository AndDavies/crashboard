import type { Metadata } from "next";
import { IntelligenceWorkbench } from "@/components/dashboard/intelligence/intelligence-workbench";
import { getIntelligenceDashboardData } from "@/lib/intelligence/data";

export const metadata: Metadata = {
  title: "Trend Intelligence · Crashboard",
  description: "Private evidence-backed trend intelligence workbench.",
};

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const data = await getIntelligenceDashboardData();
  return <IntelligenceWorkbench data={data} />;
}
