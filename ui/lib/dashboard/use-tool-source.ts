import { persistAssetImage } from "@/lib/dashboard-assets";
import type { ImportImageAssetOptions } from "@/lib/dashboard/use-asset-library";
import { assetFromImageSource } from "@/lib/image-asset-import";
import { parseReferenceDragPayload } from "@/lib/reference-drag";
import type { AssetRecord, WorkspaceMode } from "@/lib/types";

export const workspaceModeLabels: Record<Exclude<WorkspaceMode, "prompt">, string> = {
  erase: "Erase",
  vto: "VTO",
  outpaint: "Outpaint",
  deblur: "Deblur",
  glyphs: "Glyphs"
};

type UseToolSourceDeps = {
  assets: AssetRecord[];
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setAssets: (updater: (current: AssetRecord[]) => AssetRecord[]) => void;
  setSourceAssetIdForMode: (mode: Exclude<WorkspaceMode, "prompt">, id: string | null) => void;
  setSelectedAsset: (asset: AssetRecord | null) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
  importImageAssetFiles: (files: File[], options?: ImportImageAssetOptions) => Promise<AssetRecord[]>;
};

function toolWorkspaceLabel(mode: WorkspaceMode) {
  return workspaceModeLabels[mode === "prompt" ? "erase" : mode];
}

export function useToolSource(deps: UseToolSourceDeps) {
  const {
    assets,
    workspaceMode,
    setWorkspaceMode,
    setAssets,
    setSourceAssetIdForMode,
    setSelectedAsset,
    setError,
    setRecoveryMessage,
    importImageAssetFiles
  } = deps;

  function loadToolSourceAsset(asset: AssetRecord) {
    if (workspaceMode === "prompt") return;
    setSourceAssetIdForMode(workspaceMode, asset.id);
    setSelectedAsset(null);
    setError("");
    setRecoveryMessage(`Loaded ${asset.title || asset.id} in ${toolWorkspaceLabel(workspaceMode)}.`);
  }

  function sendAssetToWorkspace(asset: AssetRecord, mode: Exclude<WorkspaceMode, "prompt">) {
    setWorkspaceMode(mode);
    setSourceAssetIdForMode(mode, asset.id);
    setSelectedAsset(null);
    setRecoveryMessage(`Loaded ${asset.title || asset.id} in ${workspaceModeLabels[mode]}.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function importToolSourceFiles(files: File[]) {
    const imported = await importImageAssetFiles(files, { assetKind: "input", focusAssetsTab: false });
    if (imported[0]) loadToolSourceAsset(imported[0]);
    return imported;
  }

  async function assetFromReferenceDropPayload(payload: string) {
    const reference = parseReferenceDragPayload(payload);
    if (!reference) return null;
    if (reference.assetId) {
      return assets.find((asset) => asset.id === reference.assetId) || null;
    }
    if (!reference.value) return null;

    const asset = await assetFromImageSource({
      id: reference.id ? `reference-${reference.id}` : undefined,
      name: reference.name || `Reference ${typeof reference.index === "number" ? reference.index + 1 : ""}`.trim(),
      imageDataUrl: reference.value.startsWith("data:") ? reference.value : undefined,
      imageUrl: reference.value.startsWith("data:") ? undefined : reference.value,
      assetKind: "reference",
      provider: "reference",
      model: "reference-image",
      payload: {
        source: "reference-drag",
        referenceId: reference.id,
        referenceIndex: reference.index
      }
    });
    if (asset.imageDataUrl?.startsWith("data:")) await persistAssetImage(asset.id, asset.imageDataUrl);
    setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    return asset;
  }

  async function loadToolSourceFromDropPayload(payload: string) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    if (asset) {
      loadToolSourceAsset(asset);
      return asset;
    }
    const referenceAsset = await assetFromReferenceDropPayload(payload);
    if (referenceAsset) loadToolSourceAsset(referenceAsset);
    return referenceAsset;
  }

  function clearToolSourceAsset() {
    if (workspaceMode !== "prompt") setSourceAssetIdForMode(workspaceMode, null);
  }

  return {
    sendAssetToWorkspace,
    importToolSourceFiles,
    loadToolSourceFromDropPayload,
    clearToolSourceAsset
  };
}
