import type { Metadata } from "next";
import catalogJson from "@/content/media-workflows/generated/reference.json";
import { WorkflowReferenceTool } from "@/components/dashboard/media-workflows/workflow-reference-tool";
import type { MediaWorkflowCatalog } from "@/lib/media-workflows/types";

export const metadata: Metadata = { title: "Workflow Reference" };

export default function DashboardWorkflowReferencePage() {
  return (
    <WorkflowReferenceTool
      catalog={catalogJson as unknown as MediaWorkflowCatalog}
    />
  );
}
