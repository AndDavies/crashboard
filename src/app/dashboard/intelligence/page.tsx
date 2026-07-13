import type { Metadata } from "next";
import { IntelligenceOverview } from "@/components/dashboard/intelligence/intelligence-overview";
import { getIntelligenceUiData } from "@/components/dashboard/intelligence/intelligence-ui-data";

export const metadata: Metadata = {
  title: "Trend Intelligence · Crashboard",
  description: "Private evidence-backed trend intelligence workbench.",
};

export const dynamic = "force-dynamic";

export default async function IntelligencePage() {
  const data = await getIntelligenceUiData({ range: "90d", lens: "all", kind: "all" });
  return (
    <IntelligenceOverview
      signals={data.signals}
      completeThrough={data.completeThrough}
      completedResearch={data.completedResearch}
      dataStatus={data.dataStatus}
      usesLegacyFallback={data.usesLegacyFallback}
    />
  );
}
