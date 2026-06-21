import type { Metadata } from "next";
import catalogJson from "@/content/media-ecosystem/generated/catalog.json";
import podInventoryJson from "@/content/media-ecosystem/generated/pod_inventory.json";
import { EcosystemIndexTool } from "@/components/dashboard/media-ecosystem/ecosystem-index-tool";
import type {
  EcosystemCatalog,
  PodInventory,
} from "@/lib/media-ecosystem/types";

export const metadata: Metadata = { title: "ComfyUI Ecosystem" };

const EMPTY_POD_INVENTORY: PodInventory = {
  pod_workflows: [],
  pod_input_assets: [],
  pod_output_media: [],
  pod_models: [],
  pod_shared_models: [],
  pod_host: null,
  pod_port: null,
  scanned_at: new Date(0).toISOString(),
};

function asPodInventory(value: unknown): PodInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_POD_INVENTORY;
  }

  const candidate = value as Partial<PodInventory> & { scanned_at?: unknown };
  if (Array.isArray(candidate.pod_workflows)) {
    return candidate as PodInventory;
  }

  return {
    ...EMPTY_POD_INVENTORY,
    scanned_at:
      typeof candidate.scanned_at === "string"
        ? candidate.scanned_at
        : EMPTY_POD_INVENTORY.scanned_at,
  };
}

export default function DashboardComfyEcosystemPage() {
  return (
    <EcosystemIndexTool
      catalog={catalogJson as EcosystemCatalog}
      podInventory={asPodInventory(podInventoryJson)}
    />
  );
}
