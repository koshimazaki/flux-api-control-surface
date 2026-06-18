import { useEffect, useMemo, useState } from "react";
import { BFL_LIBRARY_KEY, RUN_LOG_KEY } from "@/lib/asset-storage";
import {
  downloadNameForAsset,
  extensionForAsset,
  loadStoredAssets,
  persistAssetLibraries,
  persistAssetImage,
  recoverStoredAssetRecords,
  removeAssetImage,
  removeAssetImages,
  safeSetItem
} from "@/lib/dashboard-assets";
import { assetFromImageFile, imageFilesFromList } from "@/lib/image-asset-import";
import { assetFromPngMetadataFile } from "@/lib/png-asset-import";
import type { AspectRatio, AssetKind, AssetRecord, DashboardTab, RunLogEntry } from "@/lib/types";

type UseAssetLibraryDeps = {
  setActiveTab: (tab: DashboardTab) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
  onAssetRemoved: (id: string) => void;
};

export type ImportImageAssetOptions = {
  assetKind?: AssetKind;
  focusAssetsTab?: boolean;
  preservePngMetadata?: boolean;
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
  async function buildImportedImageAsset(file: File, options: ImportImageAssetOptions) {
    const shouldReadPngMetadata =
      options.preservePngMetadata !== false &&
      (file.type === "image/png" || file.name.toLowerCase().endsWith(".png"));

    if (shouldReadPngMetadata) {
      try {
        const asset = await assetFromPngMetadataFile(file);
        return { ...asset, assetKind: options.assetKind || asset.assetKind || "output" };
      } catch {
        // Plain PNGs are still valid local assets; metadata is a bonus.
      }
    }

    return assetFromImageFile(file, { assetKind: options.assetKind || "input" });
  }

  async function importImageAssetFiles(files: File[], options: ImportImageAssetOptions = {}) {
    const imageFiles = imageFilesFromList(files);
    if (!imageFiles.length) return [];

    const imported: AssetRecord[] = [];
    const failed: string[] = [];

    for (const file of imageFiles) {
      try {
        const asset = await buildImportedImageAsset(file, options);
        if (asset.imageDataUrl?.startsWith("data:")) {
          await persistAssetImage(asset.id, asset.imageDataUrl);
        }
        imported.push(asset);
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `${file.name} could not be imported as an image asset.`);
      }
    }

    if (imported.length) {
      const importedIds = new Set(imported.map((asset) => asset.id));
      setAssets((current) => [...imported, ...current.filter((asset) => !importedIds.has(asset.id))]);
      if (imported.length === 1) setMetadataAssetId(imported[0].id);
      setRecoveryMessage(
        `Added ${imported.length} image asset${imported.length === 1 ? "" : "s"}${
          failed.length ? `; skipped ${failed.length}.` : "."
        }`
      );
      if (options.focusAssetsTab !== false) setActiveTab("assets");
    }

    if (failed.length) {
      setError(imported.length ? failed[0] : failed.join("\n"));
    } else {
      setError("");
    }

    return imported;
  }

  async function importPngMetadataFiles(files: File[]) {
    return importImageAssetFiles(files, { assetKind: "output", preservePngMetadata: true });
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
    importImageAssetFiles,
    importPngMetadataFiles,
    toggleFavorite,
    deleteAsset,
    toggleAssetSelection,
    clearAssets,
    downloadAssetImage
  };
}
