import { useMemo, useState } from "react";
import { readReferenceFiles, weightedReferenceCue } from "@/lib/dashboard-generation";
import { defaultReferenceCue } from "@/lib/prompt-utils";
import type { AssetRecord, ReferenceImage } from "@/lib/types";

type UseReferencesDeps = {
  assets: AssetRecord[];
  setError: (value: string) => void;
};

export function useReferences({ assets, setError }: UseReferencesDeps) {
  const [referenceCue, setReferenceCue] = useState(defaultReferenceCue);
  const [referenceWeight, setReferenceWeight] = useState(80);
  const [references, setReferences] = useState<ReferenceImage[]>([]);

  const effectiveReferenceCue = useMemo(
    () => weightedReferenceCue(referenceCue, referenceWeight),
    [referenceCue, referenceWeight]
  );
  const primaryReference = references[0];
  const primaryReferenceUrl = primaryReference?.value.startsWith("data:") ? "" : primaryReference?.value || "";
  const primaryReferencePreview = primaryReference?.value || "";

  async function addReferenceFiles(files: File[]) {
    const slots = Math.max(0, 3 - references.length);
    if (!slots) return;
    const loaded = await readReferenceFiles(files.slice(0, slots));
    setReferences((current) => [...current, ...loaded].slice(0, 3));
  }
  async function setPrimaryReferenceFiles(files: File[]) {
    const [loaded] = await readReferenceFiles(files.slice(0, 1));
    if (!loaded) return;
    setReferences((current) => [loaded, ...current.slice(1)].slice(0, 3));
  }
  function setPrimaryReferenceUrl(value: string) {
    setReferences((current) => {
      const rest = current.slice(1);
      const trimmed = value.trim();
      if (!trimmed) return rest;
      return [
        {
          id: current[0]?.id || `url-${Date.now()}`,
          name: current[0]?.name || "Reference 1",
          value: trimmed
        },
        ...rest
      ].slice(0, 3);
    });
  }
  function clearPrimaryReference() {
    setReferences((current) => current.slice(1));
  }
  function sendAssetToReference(asset: AssetRecord) {
    if (references.length >= 3) {
      setError("Reference slots are full. Remove one before adding another generated image.");
      return;
    }
    setReferences((current) => [
      ...current,
      {
        id: `asset-ref-${asset.id}-${Date.now()}`,
        name: asset.title || asset.id,
        value: asset.imageDataUrl || asset.sampleUrl || asset.imageUrl || asset.image_url,
        assetId: asset.id
      }
    ].slice(0, 3));
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function addReferenceFromDragPayload(payload: string) {
    const assetId = payload.startsWith("asset:") ? payload.slice("asset:".length) : payload;
    const asset = assets.find((item) => item.id === assetId);
    if (asset) sendAssetToReference(asset);
  }

  return {
    references,
    setReferences,
    referenceCue,
    setReferenceCue,
    referenceWeight,
    setReferenceWeight,
    effectiveReferenceCue,
    primaryReferenceUrl,
    primaryReferencePreview,
    addReferenceFiles,
    setPrimaryReferenceFiles,
    setPrimaryReferenceUrl,
    clearPrimaryReference,
    sendAssetToReference,
    addReferenceFromDragPayload
  };
}
