export type PromptRecord = {
  id: string;
  domain?: string;
  species?: string;
  prompt: string;
  seed?: number;
  lighting?: string;
  location?: string;
  plant_form?: string;
  prompt_format?: string;
  updated_at?: string;
};

export type ReferenceImage = {
  id: string;
  name: string;
  value: string;
  assetId?: string;
};

export type BatchMode = "current" | "library" | "permutations";

export type WorkspaceMode = "prompt" | "erase" | "inpaint" | "outpaint" | "glyphs";

export type DashboardTab = "script" | "audio" | "assets" | "runs" | "collections" | "apis" | "mcp" | "system";

export type AssetRecord = {
  id: string;
  title?: string;
  createdAt: string;
  timestamp: number;
  imageDataUrl: string;
  imageUrl: string;
  image_url: string;
  sampleUrl: string;
  model: string;
  prompt: string;
  status: "complete";
  is_favorite?: boolean;
  width?: number;
  height?: number;
  seed?: number;
  aspectRatio?: string;
  provider?: string;
  payload: Record<string, unknown>;
  references: ReferenceImage[];
  runSettings?: Record<string, unknown>;
  costCredits?: number | null;
  inputMp?: number | null;
  outputMp?: number | null;
  creditsBefore?: number | null;
  creditsAfter?: number | null;
  creditDelta?: number | null;
  localImagePath?: string | null;
  localPromptPath?: string | null;
  localMetadataPath?: string | null;
  remoteImageKey?: string | null;
  remotePromptKey?: string | null;
  remoteMetadataKey?: string | null;
  remoteImageUrl?: string | null;
  r2RootPrefix?: string | null;
  sourceAssetId?: string | null;
  operation?: string | null;
};

export type AssetBadge = {
  label: string;
  kind: "audio" | "reference" | "prompt" | WorkspaceMode;
  title?: string;
};

export type AspectRatio = "free" | "1:1" | "16:9" | "4:3" | "3:4" | "9:16";

export type BalanceState = {
  credits: number | null;
  checkedAt?: number;
  error?: string;
};

export type RunLogEntry = {
  id: string;
  title: string;
  timestamp: number;
  model: string;
  status: "running" | "complete" | "failed";
  promptTokens: number;
  estimatedCredits: number;
  actualCredits?: number | null;
  creditsBefore?: number | null;
  creditsAfter?: number | null;
  creditDelta?: number | null;
  durationMs?: number;
  error?: string;
  prompt?: string;
  width?: number;
  height?: number;
  batchIndex?: number;
  batchTotal?: number;
};

export type TrainingCollectionItem = {
  id: string;
  source: "asset" | "file" | "remote";
  name: string;
  fileName: string;
  imageDataUrl: string;
  mimeType: string;
  prompt?: string;
  caption: string;
  assetId?: string;
  remoteReferenceId?: string;
  remoteSetId?: string;
  remoteImageKey?: string | null;
  remoteMetadataKey?: string | null;
  remoteSourceUrl?: string | null;
  addedAt: number;
};

export type TrainingCollection = {
  id: string;
  name: string;
  triggerToken: string;
  captionGuide: string;
  createdAt: number;
  updatedAt: number;
  items: TrainingCollectionItem[];
};
