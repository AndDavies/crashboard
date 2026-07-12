import type { Metadata } from "next";
import { TrendingDashboard } from "@/components/dashboard/intelligence/trending-dashboard";
import { getTrendingAnalysis } from "@/lib/intelligence/trending-data";

export const metadata: Metadata = {
  title: "Trend Intelligence · Crashboard",
  description: "Private evidence-backed trend intelligence workbench.",
};

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const data = await getTrendingAnalysis();
  return <TrendingDashboard data={data} mode="overview" />;
}
