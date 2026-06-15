import { useEffect, useState } from "react";
import { copyText } from "@/lib/clipboard";
import { safeSetItem } from "@/lib/dashboard-assets";
import {
  captionInstructions,
  collectionItemFromAsset,
  collectionItemFromFile,
  createTrainingCollection,
  exportCollectionZip,
  TRAINING_COLLECTIONS_KEY
} from "@/lib/training-collections";
import type { AssetRecord, DashboardTab, TrainingCollection, TrainingCollectionItem } from "@/lib/types";

type CaptionAgentJob = {
  status: string;
  jobDir?: string;
  error?: string;
};

type UseTrainingCollectionsDeps = {
  assets: AssetRecord[];
  selectedAssetIds: string[];
  setSelectedAssetIds: (ids: string[]) => void;
  setActiveTab: (tab: DashboardTab) => void;
  setError: (value: string) => void;
  setRecoveryMessage: (value: string) => void;
};

export function useTrainingCollections(deps: UseTrainingCollectionsDeps) {
  const { assets, selectedAssetIds, setSelectedAssetIds, setActiveTab, setError, setRecoveryMessage } = deps;
  const [trainingCollection, setTrainingCollection] = useState<TrainingCollection>(() =>
    createTrainingCollection("Cyberflower LoRA pack")
  );
  const [captionJob, setCaptionJob] = useState<CaptionAgentJob | null>(null);
  const [remoteReferenceCount, setRemoteReferenceCount] = useState<number | null>(null);
  const [isSpawningCaptionAgent, setIsSpawningCaptionAgent] = useState(false);
  const [isSyncingReferences, setIsSyncingReferences] = useState(false);
  const [isImportingReferences, setIsImportingReferences] = useState(false);

  function addSelectedAssetsToCollection() {
    const chosenAssets = assets.filter((asset) => selectedAssetIds.includes(asset.id));
    if (!chosenAssets.length) return;
    setTrainingCollection((current) => {
      const existingAssetIds = new Set(current.items.map((item) => item.assetId).filter(Boolean));
      const newItems = chosenAssets
        .filter((asset) => !existingAssetIds.has(asset.id))
        .map((asset) => collectionItemFromAsset(asset, current.triggerToken));
      if (!newItems.length) return current;
      return { ...current, items: [...current.items, ...newItems], updatedAt: Date.now() };
    });
    setSelectedAssetIds([]);
    setActiveTab("collections");
  }
  async function addCollectionFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const newItems = await Promise.all(
      imageFiles.map((file) => collectionItemFromFile(file, trainingCollection.triggerToken))
    );
    setTrainingCollection((current) => ({
      ...current,
      items: [...current.items, ...newItems],
      updatedAt: Date.now()
    }));
    setActiveTab("collections");
  }
  async function refreshReferenceArchiveCount() {
    try {
      const response = await fetch("/api/reference-archive?limit=1000", { cache: "no-store" });
      const data = await response.json();
      setRemoteReferenceCount(typeof data.count === "number" ? data.count : 0);
    } catch {
      setRemoteReferenceCount(null);
    }
  }
  async function syncCollectionReferences() {
    const items = trainingCollection.items.filter((item) => item.imageDataUrl);
    if (!items.length) return;
    setIsSyncingReferences(true);
    setError("");
    try {
      let uploaded = 0;
      let failed = 0;
      const collection = {
        id: trainingCollection.id,
        name: trainingCollection.name,
        triggerToken: trainingCollection.triggerToken,
        captionGuide: trainingCollection.captionGuide
      };
      for (let index = 0; index < items.length; index += 8) {
        const response = await fetch("/api/reference-archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collection, items: items.slice(index, index + 8) })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not sync reference folder.");
        uploaded += data.uploaded || 0;
        failed += data.failed || 0;
      }
      await refreshReferenceArchiveCount();
      setRecoveryMessage(
        failed
          ? `Synced ${uploaded} reference image${uploaded === 1 ? "" : "s"}; ${failed} failed.`
          : `Synced ${uploaded} reference image${uploaded === 1 ? "" : "s"} to Cloudflare.`
      );
      setActiveTab("collections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sync reference folder.");
    } finally {
      setIsSyncingReferences(false);
    }
  }
  function referenceImportKey(item: TrainingCollectionItem) {
    return item.remoteReferenceId || item.remoteImageKey || item.assetId || `${item.source}:${item.fileName}:${item.name}`;
  }
  async function importRemoteReferences() {
    setIsImportingReferences(true);
    setError("");
    try {
      const response = await fetch("/api/reference-archive?limit=1000", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not import cloud references.");
      const incoming = (Array.isArray(data.items) ? data.items : []) as TrainingCollectionItem[];
      let added = 0;
      setTrainingCollection((current) => {
        const seen = new Set(current.items.map(referenceImportKey));
        const additions = incoming.filter((item) => {
          const key = referenceImportKey(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).map((item) => ({
          ...item,
          caption: item.caption || `${current.triggerToken}, `,
          addedAt: Date.now()
        }));
        added = additions.length;
        return additions.length
          ? { ...current, items: [...current.items, ...additions], updatedAt: Date.now() }
          : current;
      });
      setRemoteReferenceCount(typeof data.count === "number" ? data.count : incoming.length);
      setRecoveryMessage(
        added
          ? `Imported ${added} cloud reference image${added === 1 ? "" : "s"} into the collection.`
          : "No additional cloud references found."
      );
      setActiveTab("collections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import cloud references.");
    } finally {
      setIsImportingReferences(false);
    }
  }
  function removeCollectionItem(id: string) {
    setTrainingCollection((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
      updatedAt: Date.now()
    }));
  }
  function updateCollectionCaption(id: string, caption: string) {
    setTrainingCollection((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, caption } : item)),
      updatedAt: Date.now()
    }));
  }
  async function exportTrainingZip() {
    try {
      await exportCollectionZip(trainingCollection);
      setRecoveryMessage(`Exported ${trainingCollection.items.length} image LoRA collection ZIP.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export collection ZIP.");
    }
  }
  async function spawnCaptionAgent() {
    if (!trainingCollection.items.length) return;
    setIsSpawningCaptionAgent(true);
    setCaptionJob({ status: "Preparing caption job" });
    try {
      const response = await fetch("/api/bfl_dashboard/v1/caption_agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: trainingCollection })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not prepare caption job");
      const status = data.mode === "spawned"
        ? `Spawned Codex caption agent${data.pid ? ` pid ${data.pid}` : ""}`
        : "Prepared caption job";
      setCaptionJob({ status, jobDir: data.jobDir });
      setActiveTab("collections");
    } catch (err) {
      setCaptionJob({ status: "Caption job failed", error: err instanceof Error ? err.message : "Could not prepare caption job" });
    } finally {
      setIsSpawningCaptionAgent(false);
    }
  }
  function copyCaptionBrief() {
    void copyText(captionInstructions(trainingCollection));
  }

  useEffect(() => {
    void refreshReferenceArchiveCount();
    try {
      const saved = localStorage.getItem(TRAINING_COLLECTIONS_KEY);
      if (saved) setTrainingCollection(JSON.parse(saved));
    } catch {
      localStorage.removeItem(TRAINING_COLLECTIONS_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    safeSetItem(TRAINING_COLLECTIONS_KEY, JSON.stringify(trainingCollection));
  }, [trainingCollection]);

  return {
    trainingCollection,
    setTrainingCollection,
    captionJob,
    remoteReferenceCount,
    isSpawningCaptionAgent,
    isSyncingReferences,
    isImportingReferences,
    addSelectedAssetsToCollection,
    addCollectionFiles,
    syncCollectionReferences,
    importRemoteReferences,
    removeCollectionItem,
    updateCollectionCaption,
    exportTrainingZip,
    spawnCaptionAgent,
    copyCaptionBrief
  };
}
