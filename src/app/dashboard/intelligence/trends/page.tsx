import type { Metadata } from "next";
import { TrendingDashboard } from "@/components/dashboard/intelligence/trending-dashboard";
import { getTrendingAnalysis } from "@/lib/intelligence/trending-data";

export const metadata: Metadata = { title: "What Is Trending? · Crashboard" };
export const dynamic = "force-dynamic";

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q = "" }, data] = await Promise.all([searchParams, getTrendingAnalysis()]);
  return <TrendingDashboard data={data} mode="all" query={q.slice(0, 80)} />;
}
