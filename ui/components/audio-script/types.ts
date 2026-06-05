import type { AssetRecord, TrainingCollectionItem } from "@/lib/types";

export type AudioScriptPanelProps = {
  assets: AssetRecord[];
  collectionItems: TrainingCollectionItem[];
  onUsePrompt: (prompt: string) => void;
  onOpenImage: (asset: AssetRecord) => void;
};

export type AudioExportFormat = "mp3" | "wav";
export type VideoTarget = "seedance" | "kling" | "custom";
