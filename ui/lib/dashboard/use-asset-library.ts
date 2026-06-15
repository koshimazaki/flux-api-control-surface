import { useEffect, useMemo, useState } from "react";
import { BFL_LIBRARY_KEY, RUN_LOG_KEY } from "@/lib/asset-storage";
import {
  downloadNameForAsset,
  extensionForAsset,
  loadStoredAssets,
  persistAssetLibraries,
  recoverStoredAssetRecords,
  removeAssetImage,
  removeAssetImages,
  safeSetItem
} from "@/lib/dashboard-assets";
import type { AspectRatio, AssetRecord, DashboardTab, RunLogEntry } from "@/lib/types";

type UseAssetLibraryDeps = {
  setActiveTab: (tab: DashboardTab) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
  onAssetRemoved: (id: string) => void;
};

export function useAssetLibrary(deps: UseAssetLibraryDeps) {
  const { setActiveTab, setError, setRecoveryMessage, onAssetRemoved } = deps;
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [runLog, setRunLog] = useState<RunLogEntry[]>([]);
  const [hasLoadedAssets, setHasLoadedAssets] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [gridSize, setGridSize] = useState(4);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [metadataAssetId, setMetadataAssetId] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      `${asset.title || ""} ${asset.prompt} ${asset.model}`.toLowerCase().includes(query)
    );
  }, [assets, searchQuery]);
  const totalActualCredits = useMemo(
    () => runLog.reduce((sum, entry) => sum + (entry.actualCredits ?? entry.creditDelta ?? 0), 0),
    [runLog]
  );
  const failedRunCount = useMemo(() => runLog.filter((entry) => entry.status === "failed").length, [runLog]);

  async function recoverStoredAssets() {
    const recovered = await recoverStoredAssetRecords(assets);
    setAssets(recovered.assets);
    setRecoveryMessage(
      recovered.added
        ? `Recovered ${recovered.added} older asset${recovered.added === 1 ? "" : "s"} from browser storage.`
        : "No additional older assets found in browser storage."
    );
    setActiveTab("assets");
  }
  function toggleFavorite(id: string) {
    setAssets((current) =>
      current.map((asset) => (asset.id === id ? { ...asset, is_favorite: !asset.is_favorite } : asset))
    );
  }
  function deleteAsset(id: string) {
    removeAssetImage(id);
    setAssets((current) => current.filter((asset) => asset.id !== id));
    setSelectedAssetIds((current) => current.filter((item) => item !== id));
    if (selectedAsset?.id === id) setSelectedAsset(null);
    onAssetRemoved(id);
  }
  function toggleAssetSelection(id: string) {
    setSelectedAssetIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }
  function clearAssets() {
    removeAssetImages(assets);
    setAssets([]);
    setSelectedAssetIds([]);
  }
  async function downloadAssetImage(asset: AssetRecord) {
    const source = asset.imageDataUrl || asset.sampleUrl || asset.remoteImageUrl || asset.imageUrl || asset.image_url;
    if (!source) {
      setError("This image does not have a downloadable URL.");
      return;
    }
    let downloadUrl = source;
    let shouldRevoke = false;
    try {
      if (!source.startsWith("data:") && !source.startsWith("blob:")) {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not fetch image: ${response.status}`);
        downloadUrl = URL.createObjectURL(await response.blob());
        shouldRevoke = true;
      }
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `${downloadNameForAsset(asset)}.${extensionForAsset(asset)}`;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      if (shouldRevoke) window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      setError("");
    } catch (err) {
      if (shouldRevoke) URL.revokeObjectURL(downloadUrl);
      setError(err instanceof Error ? err.message : "Could not download image.");
    }
  }

  useEffect(() => {
    try {
      const savedLog = localStorage.getItem(RUN_LOG_KEY);
      if (savedLog) setRunLog(JSON.parse(savedLog));
    } catch {
      localStorage.removeItem(RUN_LOG_KEY);
    }
    let cancelled = false;
    loadStoredAssets()
      .then((hydrated) => {
        if (!cancelled) setAssets(hydrated);
      })
      .catch(() => localStorage.removeItem(BFL_LIBRARY_KEY))
      .finally(() => {
        if (!cancelled) setHasLoadedAssets(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (hasLoadedAssets) persistAssetLibraries(assets);
  }, [assets, hasLoadedAssets]);
  useEffect(() => {
    safeSetItem(RUN_LOG_KEY, JSON.stringify(runLog.slice(0, 200)));
  }, [runLog]);

  return {
    assets,
    setAssets,
    runLog,
    setRunLog,
    searchQuery,
    setSearchQuery,
    gridSize,
    setGridSize,
    aspectRatio,
    setAspectRatio,
    selectedAsset,
    setSelectedAsset,
    selectedAssetIds,
    setSelectedAssetIds,
    metadataAssetId,
    setMetadataAssetId,
    filteredAssets,
    totalActualCredits,
    failedRunCount,
    recoverStoredAssets,
    toggleFavorite,
    deleteAsset,
    toggleAssetSelection,
    clearAssets,
    downloadAssetImage
  };
}
