export type EcosystemWorkflow = {
  name: string;
  path: string;
  status: string;
  modality: string;
  use_case: string;
  checkpoints: string;
  loras: string;
  controlnets: string;
};

export type EcosystemAsset = {
  name: string;
  path: string;
  dimensions: string;
  category: string;
};

export type EcosystemModelCard = {
  name: string;
  path: string;
  category: string;
  size: string;
};

export type EcosystemPromptTemplate = {
  id: string;
  description: string;
  positive_template: string;
  negative_template: string;
};

export type EcosystemCatalog = {
  generated_at: string;
  project_root: string;
  promoted_workflows: EcosystemWorkflow[];
  pose_assets: EcosystemAsset[];
  identity_assets: EcosystemAsset[];
  model_cards: EcosystemModelCard[];
  prompt_templates: EcosystemPromptTemplate[];
  pod_available: boolean;
  pod_host: string | null;
  notes: string[];
};

export type PodInventoryItem = {
  pod_path: string;
  name: string;
  relative_path: string;
  root: string;
  size_bytes: number;
  size: string;
  modified: string;
};

export type PodInventory = {
  pod_workflows: PodInventoryItem[];
  pod_input_assets: PodInventoryItem[];
  pod_output_media: PodInventoryItem[];
  pod_models: PodInventoryItem[];
  pod_shared_models: PodInventoryItem[];
  pod_host: string | null;
  pod_port: string | null;
  scanned_at: string;
};
