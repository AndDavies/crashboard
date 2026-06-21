import type { Metadata } from "next";
import catalogJson from "@/content/media-workflows/generated/reference.json";
import { PromptBuilderTool } from "@/components/dashboard/prompt-builder/prompt-builder-tool";
import type { MediaWorkflowCatalog } from "@/lib/media-workflows/types";

export const metadata: Metadata = { title: "Prompt Lab" };

export default function DashboardPromptBuilderPage() {
  return (
    <PromptBuilderTool catalog={catalogJson as unknown as MediaWorkflowCatalog} />
  );
}
