export type PromptRecord = {
  id: string;
  species?: string;
  prompt: string;
  seed?: number;
  lighting?: string;
  location?: string;
  plant_form?: string;
};

export type ReferenceImage = {
  id: string;
  name: string;
  value: string;
};

export type BatchMode = "current" | "library" | "permutations";

export type DashboardTab = "assets" | "runs" | "mcp";

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
